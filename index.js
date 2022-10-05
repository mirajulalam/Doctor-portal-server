const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
var nodemailer = require('nodemailer');
const mg = require('nodemailer-mailgun-transport');


const app = express()
const port = process.env.PORT || 5000;

// middleware
app.use(cors())
app.use(express.json())


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tvrc1.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded;
        next();
    });
}

const auth = {
    auth: {
      api_key: 'a41307125cf9c837c5f89072f29ae304-8d821f0c-fd07801b',
      domain: 'sandboxb793713b86ee48ae9a96fe4dfedc45bc.mailgun.org'
    }
  }

const nodemailerMailgun = nodemailer.createTransport(mg(auth));

function sendAppointmentEmail(booking) {
    const { patient, patientName, treatment, date, slot } = booking;

    var email = {
        from: "support@test.com",
        to: patient,
        subject: `Your Appointment for ${treatment} is confirmed`,
        text: `Your Appointment for ${treatment} is confirmed`,
        html: `
        <div>
        <p>Hello ${patientName},</p>
        <h3>Your appoinment ${treatment} is confirmed</h3>
        <p>Loking forward to seeying you you on ${date} as ${slot}</p>
        <h3>Our address</h3>
        <p>andor killa bandorban</p>
        <p>bangledesh</p>
        <a href="https://web.programming-hero.com/">unsubcribe</a>
        </div>`
    };

    nodemailerMailgun.sendMail(email, (err, info) => {
        if (err) {
          console.log(err);
        }
        else {
          console.log(info);
        }
      });
}


async function run() {
    try {
        await client.connect();
        const serviceCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('booking');
        const userCollection = client.db('doctors_portal').collection('users');
        const doctorCollection = client.db('doctors_portal').collection('doctors');
        const paymentCollection = client.db('doctors_portal').collection('payments');

        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester })
            if (requesterAccount.role === 'admin') {
                next();
            }
            else {
                res.status(403).send({ message: "Forbidden Access" })
            }
        };

        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const service = req.body;
            const price = service.price;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ['card']
            });
            res.send({ clientSecret: paymentIntent.client_secret });
        });

        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query).project({ name: 1 })
            const services = await cursor.toArray()
            res.send(services)
        });

        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray()
            res.send(users)
        })

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email })
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })

        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email }
            const updateDoc = {
                $set: { role: 'admin' },
            }
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result)
        });

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email }
            const options = { upsert: true }
            const updateDoc = {
                $set: user,
            }
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ result, token })
        });

        // Warning:
        // This is the proper way to the query
        // after learning to the mongodb .use aggregate lookup,pipeline ,match .group
        app.get('/available', async (req, res) => {
            const date = req.query.date;

            // step 1: get all services
            const services = await serviceCollection.find().toArray()

            // step 2: get the booking of that day.output:[{},{},{},{},{},{},]
            const query = { date: date }
            const bookings = await bookingCollection.find(query).toArray();

            // step 3: for each services 
            services.forEach(service => {
                // step 4: find booking for that services. output:[{},{},{},{}]
                const serviceBooking = bookings.filter(book => book.treatment === service.name)
                // step 5: select slots  from service booking. output:['','','','',]
                const bookedSlots = serviceBooking.map(book => book.slot)
                // step 6: select thoes slots that are not book slots
                const available = service.slots.filter(slot => !bookedSlots.includes(slot))
                service.slots = available

            });

            res.send(services)
        })

        /**
         * Api naming conversation
         * app.get('/booking') // get all this booking in this collection or get more  then one or by filter
         * app.get('/booking/:id') // get a specific booking
         * app.post('/booking') // add a new booking 
         * app.patch('/booking/:id)
         * app.put('/booking/:id) // upsert ==> update(if exists) or insert (if doesn't exists)
         * app.delete('/booking/:id') */



        app.get('/booking', verifyJWT, async (req, res) => {
            const patient = req.query.patient;
            const decodedEmail = req.decoded.email;
            if (patient === decodedEmail) {
                const query = { patient: patient };
                const bookings = await bookingCollection.find(query).toArray();
                return res.send(bookings);
            }
            else {
                return res.status(403).send({ message: 'forbidden access' });
            }
        });

        app.get('/booking/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const booking = await bookingCollection.findOne(query)
            res.send(booking)
        })


        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, data: booking.data, patient: booking.patient }
            const exists = await bookingCollection.findOne(query)
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingCollection.insertOne(booking);
            // console.log('sender email push');
            sendAppointmentEmail(booking)
            return res.send({ success: true, result });
        });

        app.patch('/booking/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) }
            const updateDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }

            const result = await paymentCollection.insertOne(payment)
            const updatedBooking = await bookingCollection.updateOne(filter, updateDoc)
            res.send(updateDoc)
        })

        app.get('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctors = await doctorCollection.find().toArray()
            res.send(doctors)
        })

        app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorCollection.insertOne(doctor)
            res.send(result)
        });

        app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email }
            const result = await doctorCollection.deleteOne(filter)
            res.send(result)
        })
    }
    finally {

    }
}
run().catch(console.dir)

app.get('/', (req, res) => {
    res.send('Hello from doctor portal!')
})

// for testing purpost
// app.post('/email',async(req,res)=>{
//     const booking =req.body;
//     sendAppointmentEmail(booking)
//     res.send({status:true})
// })

app.listen(port, () => {
    console.log(`Doctors app listening on port ${port}`)
})