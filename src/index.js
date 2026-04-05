// require('dotenv').config({path: './env'})
import dotenv from "dotenv"
//import express from "express"
import { app } from "./app.js";
import connectDB from "./db/index.js";

//const app = express();
dotenv.config({
    path: './env'
})


connectDB()
.then(()=>{
    app.on("error",(error)=>{
        console.log("ERROR after connecting to DB and before/when listening: ",error);
        throw error;
    })
    app.listen(process.env.PORT || 8000, () =>{
        console.log(`Server is running at port : ${process.env.PORT}`);
    })
})
.catch((err) => {
    console.log("MongoDB connection failed !!! ", err);
})


/*
import express from "express"
const app = express()

;( async () => {
    try{
        await mongoose.connect(`${process.env.DB_URI}/${DB_NAME}`)
        app.on("error", (error)=>{
            console.log("ERROR:", error)
            throw error
        })
        app.listen(process.env.PORT, () =>{
            console.log(`App is listening on port ${process.env.PORT}`);
        })
    }
    catch(error){
        console.error("ERROR: ", error)
        throw err
    }
})()

*/
