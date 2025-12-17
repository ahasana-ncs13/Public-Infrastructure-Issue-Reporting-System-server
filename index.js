const { MongoClient, ServerApiVersion } = require("mongodb");
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

    app.get("/latest-issue", async (req, res) => {
      // const query=req.body
      const cursor = issueCollection
        .find({})
        .limit(6)
        .sort({ status: -1 })
        .project({id:1,title:1,category:1,status:1,priority:1,location:1,image:1,upvotes:1});
      const latestIssue = await cursor.toArray();
      res.send(latestIssue);
    });
    
    app.get("/all-issue", async (req, res) => {
      const cursor = issueCollection.find({});
      const allIssue = await cursor.toArray();
      res.send(allIssue);
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
