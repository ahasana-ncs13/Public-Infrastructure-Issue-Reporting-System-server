const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const port = process.env.PORT || 3000;

const admin = require("firebase-admin");

// const serviceAccount = require("./civicfix-firebase-adminsdk.json");

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

app.use(cors());
app.use(express.json());

const verifyFirebaseToken = async (req, res, next) => {
  // console.log(req.headers.authorization);
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    // console.log(decoded);
    req.decoded_email = decoded.email;
    next();
  } catch (err) {
    return res.status(401).send({ message: "unauthorized access" });
  }
};

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
    const feedbackCollection = CivicFixBD.collection("feedback");

    const verifyAdmin = async (req, res, next) => {
      try {
        const email = req.decoded_email;

        const user = await userCollection.findOne({ email });

        if (!user || user.role !== "Admin") {
          return res
            .status(403)
            .send({ message: "forbidden access (admin only)" });
        }

        next();
      } catch (error) {
        res.status(500).send({ message: "admin verification failed" });
      }
    };

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
      const { title, category, location, limit, skip } = req.query;
      let query = {};
      if (title || category || location) {
        // Search title using regex, case-insensitive
        query.$or = [
          { title: { $regex: title, $options: "i" } },
          { category: { $regex: category, $options: "i" } },
          { location: { $regex: location, $options: "i" } },
        ];
      }
      // console.log(title);
      const countIssue = await issueCollection.countDocuments();
      const cursor = issueCollection
        .find(query)
        .sort({ priority: 1 })
        .limit(Number(limit))
        .skip(Number(skip));
      const allIssue = await cursor.toArray();

      //  console.log(req.headers)
      res.send({ allIssue, total: countIssue });
    });

    // feedback api
    app.get("/feedback", async (req, res) => {
      const cursor = feedbackCollection.find({});
      const newFeedback = await cursor.toArray();
      res.send(newFeedback);
    });

    // new feedback api
    app.post("/newfeedback", async (req, res) => {
      const user = req.body;
      // Check if user already exists
      // const existingUser = await feedbackCollection.findOne({
      //   email: user.email,
      // });
      // if (existingUser) {
      //   return res.send({
      //     message: "User already exists",
      //     inserted: false,
      //   });
      // }
      const newfeedback = {
        name: user.name,
        email: user.email,
        rating:user.rating,
        comment:user.comment,
        createdAt: new Date(),
        
      };
      const result = await feedbackCollection.insertOne(newfeedback);
      res.send(result);
    });

    // feedback delete api
    app.delete("/feedback/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email:email};
      const deletefeedback = await feedbackCollection.deleteOne(query);
      res.send(deletefeedback);
    });

    // update upvote api
    app.patch("/all-issue/:id", verifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const { email } = req.body;
      const query = { _id: new ObjectId(id) };
      const issue = await issueCollection.findOne(query);

      if (issue.email === email) {
        return res
          .status(403)
          .send({ message: "You cannot upvote your own issue" });
      }

      if (issue.upvotedBy?.includes(email)) {
        return res.send({ message: "Already upvoted" });
      }
      const updateUpvote = {
        $inc: { upvotes: 1 },
        $push: { upvotedBy: email },
      };
      const updatedUpvote = await issueCollection.updateOne(
        query,
        updateUpvote
      );
      res.send({ message: "Upvoted successfully", updatedUpvote });
    });

    // details Issue api
    app.get("/issue-details/:id", verifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const detailsIssue = await issueCollection.findOne(query);
      res.send(detailsIssue);
    });

    // users api
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
        role: user.role || "user",
        isPremium: false,
        createdAt: new Date(),
        lastLogin: new Date(),
      };
      const result = await userCollection.insertOne(newUser);
      res.send(result);
    });

    // current user api
    app.get("/currentuser/:email", async (req, res) => {
      const email = req.params.email;
      const currentuser = await userCollection.findOne({ email });
      res.send(currentuser);
    });
    // current user update api
    app.patch("/currentuser/:email", verifyFirebaseToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const currentuser = req.body;
      if (req.decoded_email !== req.params.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const updateUser = {
        $set: {
          name: currentuser.name,
          email: currentuser.email,
          photoURL: currentuser.photoURL,
        },
      };
      const updateCurrentuser = await userCollection.updateOne(
        query,
        updateUser
      );
      res.send(updateCurrentuser);
    });

    // citizenDashboard report issue api
    app.post("/reportissue", verifyFirebaseToken, async (req, res) => {
      const Newissue = req.body;
      // Newissue.email = req.body.email;
      const user = await userCollection.findOne({ email: Newissue.email });

      if (user.isPremium === false) {
        const issueCount = await issueCollection.countDocuments({
          email: Newissue.email,
        });

        if (issueCount >= 3) {
          return res.status(403).send({
            message: "Free users can submit only 3 issues. Please subscribe.",
          });
        }
      }
      const newissue = {
        ...Newissue,
        status: "Pending",
        priority: "Normal",
        upvotes: 0,
        createdAt: new Date(),
      };

      const reportIssue = await issueCollection.insertOne(newissue);
      res.send(reportIssue);
    });

    app.get("/myissue-count/:email", verifyFirebaseToken, async (req, res) => {
      const email = req.params.email;
      if (req.decoded_email !== req.params.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const count = await issueCollection.countDocuments({ email });

      res.send({ count });
    });

    // citizenDashboard myissue api
    app.get("/myissue", verifyFirebaseToken, async (req, res) => {
      const { email } = req.query;
      const query = {};
      if (email) {
        query.email = email;
        if (req.decoded_email !== req.query.email) {
          return res.status(403).send({ message: "forbidden access" });
        }
      }
      const cursor = issueCollection.find(query);
      const myissue = await cursor.toArray();
      res.send(myissue);
    });

    // citizenDashboard myissue update api
    app.patch("/myissue/:id", verifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const issue = req.body;
      const updateIssue = {
        $set: {
          title: issue.title,
          description: issue.description,
          category: issue.category,
          location: issue.location,
          image: issue.image,
          status: issue.status,
          email: issue.email,
          priority: issue.priority,
          updatedAt: new Date(),
        },
      };
      const editedIssue = await issueCollection.updateOne(query, updateIssue);
      res.send(editedIssue);
    });
    // citizenDashboard myissue delete api
    app.delete("/myissue/:id", verifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const deleteIssue = await issueCollection.deleteOne(query);
      res.send(deleteIssue);
    });

    // citizenDashboard dashboard-statics api
    app.get(
      "/citizendashboard-stats",
      verifyFirebaseToken,
      async (req, res) => {
        const totalIssues = await issueCollection.countDocuments();
        const pendingIssues = await issueCollection.countDocuments({
          status: "Pending",
        });
        const inProgressIssues = await issueCollection.countDocuments({
          status: "In Progress",
        });

        const resolvedIssues = await issueCollection.countDocuments({
          status: "Resolved",
        });

        // const payments = await paymentCollection
        //   .aggregate([
        //     {
        //       $group: {
        //         _id: null,
        //         totalAmount: { $sum: "$amount" },
        //       },
        //     },
        //   ])
        //   .toArray();

        res.send({
          totalIssues,
          pendingIssues,
          inProgressIssues,
          resolvedIssues,
          // totalPayments: payments[0]?.totalAmount || 0,
        });
      }
    );

    // payment related api
    app.post(
      "/create-checkout-session",
      verifyFirebaseToken,
      async (req, res) => {
        const paymentInfo = req.body;
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          line_items: [
            {
              price_data: {
                currency: "BDT",
                product_data: {
                  name: "Premium Subscription",
                },
                unit_amount: 1000 * 100,
              },
              quantity: 1,
            },
          ],
          customer_email: paymentInfo.email,
          metadata: {
            PremiumUser_id: paymentInfo.PremiumUser_id,
          },
          success_url: `${process.env.SITE_DOMAIN}/dashboardLayout/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.SITE_DOMAIN}/dashboardLayout/payment-cancel`,
        });
        // console.log(session)
        res.send({ url: session.url });
      }
    );

    app.patch("/payment-success", verifyFirebaseToken, async (req, res) => {
      const { sessionId } = req.body;

      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status === "paid") {
        const email = session.customer_email;
        const issueId = session.metadata.issue_id;

        await userCollection.updateOne(
          { email: email },
          {
            $set: {
              payment_status: "paid",
              isPremium: true,
              premiumSince: new Date(),
            },
          }
        );
        await issueCollection.updateOne(
          { _id: new ObjectId(issueId) },
          {
            $set: {
              payment_status: "paid",
              priority: "High",
              premiumSince: new Date(),
            },
          }
        );

        return res.send({ success: true });
      }

      res.status(400).send({ success: false });
    });

    // boost payment api
    app.post(
      "/create-checkout-session-boost",
      verifyFirebaseToken,
      async (req, res) => {
        const paymentInfo = req.body;
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          line_items: [
            {
              price_data: {
                currency: "BDT",
                product_data: {
                  name: paymentInfo.title,
                },
                unit_amount: 100 * 100,
              },
              quantity: 1,
            },
          ],
          customer_email: paymentInfo.email,
          metadata: {
            issue_id: paymentInfo._id,
          },
          success_url: `${process.env.SITE_DOMAIN}/dashboardLayout/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.SITE_DOMAIN}/dashboardLayout/payment-cancel`,
        });
        // console.log(session);
        res.send({ url: session.url });
      }
    );

    app.get(
      "/admin/dashboard-stats",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const totalIssues = await issueCollection.countDocuments();
        const resolvedIssues = await issueCollection.countDocuments({
          status: "Resolved",
        });
        const pendingIssues = await issueCollection.countDocuments({
          status: "Pending",
        });
        // const rejectedIssues = await issueCollection.countDocuments({
        //   status: "Rejected",
        // });

        // total payment (premium + boost)
        // const payments = await userCollection
        //   .aggregate([
        //     { $match: { payment_status: "paid" } },
        //     {
        //       $group: {
        //         _id: null,
        //         totalAmount: { $sum: 1000 }, // premium price
        //       },
        //     },
        //   ])
        //   .toArray();

        res.send({
          totalIssues,
          resolvedIssues,
          pendingIssues,
          // rejectedIssues,
          // totalPayment: payments[0]?.totalAmount || 0,
        });
      }
    );

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
