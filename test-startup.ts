console.log("1. starting...");
import express from "express";
console.log("2. express ok");
import { createServer } from "http";
console.log("3. http ok");
const app = express();
console.log("4. app created");
const server = createServer(app);
console.log("5. server created");
server.listen(3000, () => {
  console.log("6. listening on 3000");
});
