const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express()
const port = process.env.PORT || 5000;

// middleware
app.use(cors())
app.use(express.json())


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tvrc1.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect();
        const serviceCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('booking');

        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query)
            const services = await cursor.toArray()
            res.send(services)
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
         * app.delete('/booking/:id') */

        app.get('/booking', async (req, res) => {
            const patient = req.query.patient;
            const query = { patient: patient }
            const bookings = await bookingCollection.find(query).toArray();
            res.send(bookings)
        });

        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, data: booking.data, patient: booking.patient }
            const exists = await bookingCollection.findOne(query)
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingCollection.insertOne(booking);

            return res.send({ success: true, result });
        })
    }
    finally {

    }
}
run().catch(console.dir)

app.get('/', (req, res) => {
    res.send('Hello from doctor portal!')
})

app.listen(port, () => {
    console.log(`Doctors app listening on port ${port}`)
})