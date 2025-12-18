const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.USER_PASSWORD}@cluster0.j6dmigp.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const CivicFixBD = client.db("CivicFixBD");
    const issueCollection = CivicFixBD.collection("all-Issue");
    const userCollection = CivicFixBD.collection("users");
    const reportIssueCollection = CivicFixBD.collection("reportIssue");

    // latest Issue api
    app.get("/latest-issue", async (req, res) => {
      const cursor = issueCollection
        .find({})
        .limit(6)
        .sort({ status: -1 })
        .project({
          id: 1,
          title: 1,
          category: 1,
          status: 1,
          priority: 1,
          location: 1,
          image: 1,
          upvotes: 1,
        });
      const latestIssue = await cursor.toArray();
      res.send(latestIssue);
    });

    // all issue api
    app.get("/all-issue", async (req, res) => {
      const { title, category, location } = req.query;
      let query = {};
      if (title || category || location) {
        // Search title using regex, case-insensitive
        query.$or = [
          { title: { $regex: title, $options: "i" } },
          { category: { $regex: category, $options: "i" } },
          { location: { $regex: location, $options: "i" } },
        ];
      }
      console.log(title);
      const cursor = issueCollection.find(query);
      const allIssue = await cursor.toArray();
      res.send(allIssue);
    });

    // update upvote api
    app.patch("/all-issue/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateUpvote = {
        $inc: { upvotes: 1 },
      };
      const updatedUpvote = await issueCollection.updateOne(
        query,
        updateUpvote
      );
      res.send(updatedUpvote);
    });

    // // update edit api
    // app.patch("/edit-issue/:id",async(req,res)=>{
    //   const id = req.params.id
    //   //  const data= req.body
    //   const query={_id : new ObjectId(id)}

    //   console.log(data)

    //   // const updatedData ={
    //   //   $set: data
    //   // }

    //   const updatedIssue = await issueCollection.findOne(
    //     query,
    //     // updatedData
    //   );
    //   res.send(updatedIssue);
    // })
    // details Issue api
    app.get("/issue-details/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const detailsIssue = await issueCollection.findOne(query);
      res.send(detailsIssue);
    });

    // user api
    app.post("/users", async (req, res) => {
      const user = req.body;

      // Check if user already exists
      const existingUser = await userCollection.findOne({
        email: user.email,
      });

      if (existingUser) {
        return res.send({
          message: "User already exists",
          inserted: false,
        });
      }

      const newUser = {
        name: user.name,
        email: user.email,
        photoURL: user.photoURL || "",
        role: "user",
        createdAt: new Date(),
        lastLogin: new Date(),
      };
      const result = await userCollection.insertOne(newUser);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Public Infrastructure Issue Reporting System server is running!");
});
app.listen(port, () => {
  console.log(
    `Public Infrastructure Issue Reporting System app listening on port ${port}`
  );
});
