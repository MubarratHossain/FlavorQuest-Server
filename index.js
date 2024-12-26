require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
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
    console.log("Connected to MongoDB!");

    const database = client.db("JobPortal");
    const userCollection = database.collection("users");
    const foodCollection = database.collection("foodItems");

    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_TOKEN, { expiresIn: '180h' });

      res.cookie('token', token, {
        httpOnly: true,
        secure: false
      }).send({ success: true });
    });

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

        const newUser = { name, email };
        const result = await userCollection.insertOne(newUser);

        res.status(201).json({
          message: "User registered successfully",
          userId: result.insertedId,
        });
      } catch (error) {
        res.status(500).json({ error: "Failed to register user" });
      }
    });

    app.post('/foods', async (req, res) => {
      try {
        const {
          foodName,
          foodImage,
          foodCategory,
          quantity,
          price,
          foodOrigin,
          description,
          addedBy
        } = req.body;

        if (!foodName || !foodImage || !foodCategory || !quantity || !price || !foodOrigin || !description || !addedBy) {
          return res.status(400).json({ error: "All fields are required" });
        }

        const newFood = {
          foodName,
          foodImage,
          foodCategory,
          quantity: parseInt(quantity),
          price: parseFloat(price),
          foodOrigin,
          description,
          addedBy,
          createdAt: new Date()
        };

        const result = await foodCollection.insertOne(newFood);

        res.status(201).json({
          message: "Food item added successfully",
          foodId: result.insertedId
        });
      } catch (error) {
        console.error("Error saving food item:", error);
        res.status(500).json({ error: "Failed to add food item" });
      }
    });

    app.put('/foods/:id', async (req, res) => {
      const { id } = req.params;
      const {
          foodName,
          foodImage,
          foodCategory,
          quantity,
          price,
          foodOrigin,
          description,
      } = req.body;
  
      if (!foodName || !foodImage || !foodCategory || !quantity || !price || !foodOrigin || !description) {
          return res.status(400).json({ error: "All fields are required" });
      }
  
      try {
          const updatedFood = {
              foodName,
              foodImage,
              foodCategory,
              quantity: parseInt(quantity),
              price: parseFloat(price),
              foodOrigin,
              description,
              updatedAt: new Date(),
          };
  
          const result = await foodCollection.updateOne(
              { _id: new ObjectId(id) },
              { $set: updatedFood }
          );
  
          if (result.modifiedCount === 0) {
              return res.status(404).json({ error: "Food item not found or no changes made" });
          }
  
          res.status(200).json({ message: "Food item updated successfully" });
      } catch (error) {
          console.error("Error updating food item:", error);
          res.status(500).json({ error: "Failed to update food item" });
      }
  });
  

   

    // POST route to handle food purchases
    app.post('/purchases', async (req, res) => {
      const { foodName, price, quantity, buyerName, buyerEmail, buyingDate } = req.body;

      if (!foodName || !price || !quantity || !buyerName || !buyerEmail || !buyingDate) {
        return res.status(400).json({ error: "All fields are required" });
      }

      const session = client.startSession();

      try {
        session.startTransaction();

        const foodItem = await foodCollection.findOne({ foodName }, { session });

        if (!foodItem) {
          await session.abortTransaction();
          return res.status(404).json({ error: "Food item not found" });
        }

        if (quantity > foodItem.quantity) {
          await session.abortTransaction();
          return res.status(400).json({ error: "Not enough stock available" });
        }

        const purchase = {
          foodName,
          price,
          quantity,
          buyerName,
          buyerEmail,
          buyingDate,
          status: 'Pending',
        };

        // Insert the purchase record
        const result = await database.collection("purchases").insertOne(purchase, { session });

        // Update food item quantity and purchase count
        const updatedQuantity = foodItem.quantity - quantity;
        const updatedPurchaseCount = (foodItem.purchaseCount || 0) + quantity;

        await foodCollection.updateOne(
          { foodName },
          { $set: { quantity: updatedQuantity }, $inc: { purchaseCount: quantity } },
          { session }
        );

        await session.commitTransaction();

        res.status(201).json({
          message: "Purchase successful",
          purchaseId: result.insertedId,
          updatedQuantity,
          updatedPurchaseCount,
        });
      } catch (error) {
        console.error("Error making the purchase:", error);
        await session.abortTransaction();
        res.status(500).json({ error: "Failed to make the purchase" });
      } finally {
        session.endSession();
      }
    });



    app.get('/purchases', async (req, res) => {
      try {
        const purchases = await database.collection("purchases").find().toArray();
        res.status(200).json(purchases);
      } catch (error) {
        console.error("Error fetching purchases:", error);
        res.status(500).json({ error: "Failed to fetch purchases" });
      }
    });


    app.get('/purchases/:id', async (req, res) => {
      const { id } = req.params;

      try {
        const purchase = await database.collection("purchases").findOne({ _id: new ObjectId(id) });

        if (!purchase) {
          return res.status(404).json({ error: "Purchase not found" });
        }

        res.status(200).json(purchase);
      } catch (error) {
        console.error("Error fetching purchase by ID:", error);
        res.status(500).json({ error: "Failed to fetch purchase" });
      }
    });

    // DELETE route to delete a purchase by its ID
app.delete('/purchases/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await database.collection("purchases").deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Purchase not found" });
    }

    res.status(200).json({ message: "Purchase deleted successfully" });
  } catch (error) {
    console.error("Error deleting purchase:", error);
    res.status(500).json({ error: "Failed to delete purchase" });
  }
});






    // GET route to fetch all food items
    app.get('/foods', async (req, res) => {
      try {
        const foodItems = await foodCollection.find().toArray();
        res.status(200).json(foodItems);
      } catch (error) {
        console.error("Error fetching food items:", error);
        res.status(500).json({ error: "Failed to fetch food items" });
      }
    });



    // GET route to fetch a single food item by its ID
    app.get('/foods/:id', async (req, res) => {
      const { id } = req.params;

      try {

        const foodItem = await foodCollection.findOne({ _id: new ObjectId(id) });

        if (!foodItem) {
          return res.status(404).json({ error: "Food item not found" });
        }

        res.status(200).json(foodItem);
      } catch (error) {
        console.error("Error fetching food item by ID:", error);
        res.status(500).json({ error: "Failed to fetch food item" });
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