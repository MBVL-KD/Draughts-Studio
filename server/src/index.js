require("dotenv").config();

const app = require("./app");
const connectMongo = require("./config/mongo");

const PORT = process.env.PORT || 4000;

const start = async () => {
  await connectMongo();

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};

start();