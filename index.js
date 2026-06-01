const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

app.use(cors({
  origin: ['https://venerable-sawine-b24154.netlify.app', 'http://localhost'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

app.post('/webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const bookingId = session.metadata?.bookingId;
    if (bookingId) {
      await db.collection('booking_appointments').doc(bookingId).update({
        status: 'confirmed',
        paymentStatus: 'paid',
        stripeSessionId: session.id,
        confirmedAt: new Date()
      });
    }
  }
  res.json({ received: true });
});

app.use(bodyParser.json());

app.post('/create-checkout', async (req, res) => {
  const { bookingId, shopName, serviceName, customerName, date, time, shopPhone } = req.body;
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'gbp',
          product_data: {
            name: `Booking Fee — ${shopName}`,
            description: `${serviceName} on ${date} at ${time}`
          },
          unit_amount: 100
        },
        quantity: 1
      }],
      mode: 'payment',
      success_url: `https://venerable-sawine-b24154.netlify.app/booking.html?shop=${shopPhone || ''}&confirmed=${bookingId}`,
      cancel_url: `https://venerable-sawine-b24154.netlify.app/booking.html?shop=${shopPhone || ''}&cancelled=true`,
      metadata: { bookingId }
    });
    res.json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/', (req, res) => res.send('Ustad Booking Server running'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
