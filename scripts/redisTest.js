import { createClient } from "redis";

const client = createClient({
  username: "default",
  password: "sHL1UFNZ8WKMNbFhj8TvuEaSTavupdiB",
  socket: {
    host: "redis-19333.c8.us-east-1-4.ec2.redns.redis-cloud.com",
    port: 19333,
  },
});

client.on("error", (err) => console.log("Redis Client Error", err));

await client.connect();

await client.set("foo", "bar");
const result = await client.get("foo");
console.log(result); // >>> bar
