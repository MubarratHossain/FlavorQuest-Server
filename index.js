require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
  origin : ['http://localhost:5173'],
  credentials:true
}));
app.use(express.json());
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@cluster0.6zv7z.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB!");

    const database = client.db("JobPortal");
    const userCollection = database.collection("users");

    app.post('/jwt',(req,res) =>
    {
      const user =req.body;
      const token =jwt.sign(user,process.env.JWT_TOKEN,{expiresIn:'180h'});

      res.cookie('token',token,{
        httpOnly:true,
        secure:false
      })
      .send({success:true})

    })
    app.post('/logout', (req, res) => {
      res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', 
        
      });
    
      res.status(200).json({ success: true, message: 'Logged out successfully' });
    });
    

    
    app.post('/users', async (req, res) => {
      const { name, email, password, photoURL } = req.body;

      if (!name || !email || !password || !photoURL) {
        return res.status(400).json({ error: "All fields are required" });
      }

      try {
        
        const existingUser = await userCollection.findOne({ email });
        if (existingUser) {
          return res.status(409).json({ error: "User already exists" });
        }

        
        const newUser = { name, email, password, photoURL };
        const result = await userCollection.insertOne(newUser);

        res.status(201).json({
          message: "User registered successfully",
          userId: result.insertedId,
        });
      } catch (error) {
        res.status(500).json({ error: "Failed to register user" });
      }
    });

    
    app.get('/users', async (req, res) => {
      try {
        const users = await userCollection.find().toArray();
        res.status(200).json(users);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch users" });
      }
    });

  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Backend Server is Running');
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
