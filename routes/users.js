// Create express server + create app
const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

// Database
const User = require("../models/user");
const Task = require("../models/task");

// Set Routes
router.get("/", async (req, res) => {
  try {
    // Get tasks based on parameters

    // Read from url
    const where = req.query.where;
    const sort = req.query.sort;
    const select = req.query.select;
    const skip = req.query.skip;
    const limit = req.query.limit;
    const count = req.query.count;

    // convert string to obj
    const filter = where ? JSON.parse(where) : {};
    const sorting = sort ? JSON.parse(sort) : {};
    const fields = select ? JSON.parse(select) : {};

    let skipAmt = 0;
    if (skip != undefined) {
      skipAmt = Number(skip);
    }

    if (count == "true") {
      const total = await User.countDocuments(filter);
      return res.status(200).json(total);
    }

    // retrieve docs from users collection
    const users = await User.find(filter)
      .sort(sorting)
      .select(fields)
      .skip(skipAmt)
      .limit(limit === undefined ? 0 : Number(limit));

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Error getting user" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    let fields;
    const select = req.query.select;

    if (select) {
      // fields = JSON.parse(select).join(" ") + " -_id";
      fields = JSON.parse(select).join(" ");
    } else {
      fields = "";
    }
    // retrieve docs from users collection
    const user = await User.findById(req.params.id).select(fields);

    // Error handling
    if (user == null) {
      return res.status(404).json({ message: "User doesn't exist" });
    }
    res.status(200).json(user);

    // CastError
  } catch (error) {
    res.status(404).json({ message: "User id is invalid" });
  }
});

router.post("/", async (req, res) => {
  try {
    // create user
    const user = new User({
      name: req.body.name,
      email: req.body.email,
    });

    // Error Handling
    if (!req.body.name || !req.body.email) {
      return res
        .status(400)
        .json({ message: "Missing required fields", data: null });
    }

    // Duplicate user email
    const exisitingEmail = await User.findOne({ email: req.body.email });
    if (exisitingEmail) {
      res.status(400).json({ message: "Email already exists", data: null });
    }

    // save to mongodb
    await user.save();

    // return the user
    return res.status(201).json({
      message: "User created",
      data: user,
    });
  } catch (error) {
    res.status(500).json({ message: "Error adding/creating user", data: null });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    // retrieve docs from users collection
    const deletedUser = await User.findByIdAndDelete(req.params.id);

    // Error handling
    if (deletedUser == null) {
      return res.status(404).json({ message: "User doesn't exist" });
    }

    res.status(204).send();
  } catch (error) {
    res.status(400).json({ message: "Invalid user id, can't delete user" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({
        message: "Invalid user ID",
        data: null,
      });
    }
    // find the exisiting user
    const user = await User.findById(req.params.id);

    // ---- validation
    // does user exisit
    if (!user) {
      return res.status(404).json({
        message: "User doesn't exist",
        data: null,
      });
    }

    // validate requried fields + ADD MORE HERE
    if (
      typeof req.body.name !== "string" ||
      !req.body.name.trim() ||
      typeof req.body.email !== "string" ||
      !req.body.email.trim()
    ) {
      return res.status(400).json({
        message: "Missing or invalid required fields",
        data: null,
      });
    }

    if (
      req.body.pendingTasks !== undefined &&
      !Array.isArray(req.body.pendingTasks)
    ) {
      return res.status(400).json({
        message: "pendingTasks must be an array",
        data: null,
      });
    }

    const newPendingTasks = req.body.pendingTasks || [];

    // get new pending task ids
    for (const task of newPendingTasks) {
      // validate each task id
      if (!mongoose.isValidObjectId(task)) {
        return res.status(400).json({
          message: "Task id is invalid",
          data: null,
        });
      }

      // find and validate each task
      const oldTask = await Task.findById(task);

      if (!oldTask) {
        return res.status(404).json({
          message: "Task don't exisit",
          data: null,
        });
      }

      // Check if task is completed
      if (oldTask.completed) {
        return res.status(400).json({
          message: "Completed task cannot be pending",
          data: null,
        });
      }
    }

    // check / see for diplicates
    const existingEmail = await User.findOne({
      email: req.body.email,
      _id: { $ne: user._id },
    });

    if (existingEmail) {
      return res.status(400).json({
        message: "Email already exists",
        data: null,
      });
    }

    // find tasks assigned to user
    const oldTasks = await Task.find({
      assignedUser: user.id,
    });

    // unassign removed tasks
    for (const task of oldTasks) {
      if (!task.completed && !newPendingTasks.includes(task.id.toString())) {
        await Task.findByIdAndUpdate(task.id, {
          assignedUser: "",
          assignedUserName: "unassigned",
        });
      }
    }
    // assign new tasks
    for (const taskId of newPendingTasks) {
      const task = await Task.findById(taskId);

      // remove task from previous user pendingTasks
      if (task.assignedUser && task.assignedUser.toString() !== user.id) {
        await User.findByIdAndUpdate(task.assignedUser, {
          $pull: { pendingTasks: taskId },
        });
      }

      // Assign task to current user
      await Task.findByIdAndUpdate(taskId, {
        assignedUser: user.id,
        assignedUserName: req.body.name,
      });
    }

    // ipdate names on assigned tasks
    await Task.updateMany(
      { assignedUser: user.id },
      { $set: { assignedUserName: req.body.name } },
    );

    // retrieve docs from users collection
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      {
        name: req.body.name,
        email: req.body.email,
        pendingTasks: newPendingTasks,
      },
      {
        new: true, // returns the new updated user
        runValidators: true, // does update run on schema rules
      },
    );

    // return the user
    res
      .status(200)
      .json({ message: "Success: User Updated!", data: updatedUser });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      message: "Internal server error",
      data: null,
    });
  }
});

module.exports = router;
