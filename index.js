const express = require("express");

const app = express();

require("dotenv").config();
const cors = require("cors");
const axios = require("axios");

const port = process.env.PORT;

app.listen(port, () => {
  console.log(`app is running on localhost:${port}`);
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

app.get("/", (req, res) => {
  res.send("<h1>Hello from Alex</h1>");
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
        CallBackURL: "https://apisimba.com/lion/callback",
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

app.post("/lion/callback", (req, res) => {
  const callbackData = req.body;
  console.log(callbackData.Body);

  if (!callbackData.Body.stkCallback.CallbackMetadata) {
    console.log(callbackData.Body);
    res.status(200).json({ message: "Callback received successfully" });
  }

  console.log(callbackData.Body.stkCallback.CallbackMetadata);
  
});
