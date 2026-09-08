import { Application } from "../src/Application";

const app = Application.create();
console.log(`Schema ready at ${app.config.databasePath}`);
app.close();
