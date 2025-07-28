const express = require("express");
const app = express();

require("dotenv").config();
const cors = require("cors");
const axios = require("axios");
const mongoose = require("mongoose");

const port = process.env.PORT;
const Payment = require("./models/paymentModel");

app.listen(port, "0.0.0.0", () => {
  console.log(`app is running on 0.0.0.0:${port}`);
});

mongoose
  .connect(process.env.MONGO_URL)
  .then(() => {
    console.log("database connected successfully");
  })
  .catch((err) => {
    console.log(err.message);
  });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

app.get("/", (req, res) => {
  res.send("<h1>Hello from Alex</h1>");
});

app.post("/test", (req, res) => {
  console.log("POST body:", req.body);
  res.json({ ok: true, body: req.body });
});

//middleware for token
// Middleware to generate token
const generateToken = async (req, res, next) => {
  const secret = process.env.CONSUMER_SECRET;
  const consumer = process.env.CONSUMER_KEY;

  const auth = Buffer.from(`${consumer}:${secret}`).toString("base64");

  try {
    const response = await axios.get(
      "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      }
    );
    req.token = response.data.access_token;
    next();
  } catch (err) {
    console.error("Token generation error:", err.message);
    return res.status(500).json({ error: "Failed to generate token" });
  }
};

app.get("/token", generateToken, (req, res) => {
  res.json({ token: req.token });
});

app.post("/stk", generateToken, async (req, res) => {
  const phone = req.body.phone.substring(1);
  const amount = req.body.amount;

  // Helper: Generate timestamp and password
  const generateTimestamp = () => {
    const now = new Date();
    return now
      .toISOString()
      .replace(/[-T:.Z]/g, "")
      .slice(0, 14); // Format: YYYYMMDDHHMMSS
  };

  const timestamp = generateTimestamp();
  const passkey = process.env.PASSKEY;
  const shortcode = process.env.SHORTCODE;

  const password = new Buffer.from(shortcode + passkey + timestamp).toString(
    "base64"
  );

  await axios
    .post(
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",

      {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline", //"CustomerBuyGoodsOnline"
        Amount: amount,
        PartyA: `254${phone}`,
        PartyB: shortcode,
        PhoneNumber: `254${phone}`,
        CallBackURL: "https://apisimba.com/callback",
        AccountReference: "Test Paid",
        TransactionDesc: "Test",
      },
      {
        headers: {
          Authorization: `Bearer ${req.token}`,
        },
      }
    )
    .then((data) => {
      console.log(data.data);
      res.status(200).json(data.data);
    })
    .catch((err) => {
      console.log(err.message);
      res.status(400).json(err.message);
    });
});

app.post("/callback", (req, res) => {
  const callbackData = req.body;
  // console.log(callbackData.Body);

  if (!callbackData.Body.stkCallback.CallbackMetadata) {
    console.log(callbackData.Body);
    return res.status(200).json({ message: "Callback received successfully" });
  }

  console.log(callbackData.Body.stkCallback.CallbackMetadata);

  const amount = callbackData.Body.stkCallback.CallbackMetadata.Item[0].Value;
  const trx_id = callbackData.Body.stkCallback.CallbackMetadata.Item[1].Value;
  const phone = callbackData.Body.stkCallback.CallbackMetadata.Item[4].Value;
  console.log({ phone, amount, trx_id });

  const payment = new Payment();
  payment.number = phone;
  payment.amount = amount;
  payment.trx_id = trx_id;

  payment
    .save()
    .then((data) => {
      console.log({message:"saved successfully", data});
    })
    .catch((err) => {
      console.log(err.message);
    });

  // Send a response here as well!
  return res.status(200).json({ message: "Callback received successfully" });
});
