import express from "express";
import { signinDoctor, signinNurse } from "../controllers/userController.js";
// import { signin, signup } from "../controllers/userController.js";
import { auth } from "./../middleware/auth.js";
import {
  addFollowUp,
  getLastFollowUpTime,
} from "../controllers/nurseController.js";

const nurseRouter = express.Router();

//nurseRouter.post("/signup", signup);
nurseRouter.post("/signin", signinNurse);
nurseRouter.post("/addFollowUp", auth, addFollowUp);
nurseRouter.get("/lastFollowUp", getLastFollowUpTime);
// nurseRouter.post("/signin", );

// nurseRouter.get("/profile", auth, getUserProfile);
// nurseRouter.patch("/edit-profile", auth, upload.single("image"), editProfile);

export default nurseRouter;