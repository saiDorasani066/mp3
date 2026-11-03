const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const Task = require("../models/task");
const User = require("../models/user");

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
    let maxAmtResults = 100;
    if (limit !== undefined) {
      maxAmtResults = Number(limit);
    }
    if (count == "true") {
      const total = await Task.countDocuments(filter);
      return res.status(200).json({ message: "OK", data: total });
    }

    const tasks = await Task.find(filter)
      .sort(sorting)
      .select(fields)
      .skip(skipAmt)
      .limit(maxAmtResults);

    res.status(200).json({ message: "OK", data: tasks });
  } catch (error) {
    res.status(500).json({ message: "Error getting tasks" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const select = req.query.select;
    const fields = select ? JSON.parse(select) : {};

    // retrieve docs from users collection
    const task = await Task.findById(req.params.id).select(fields);

    // Error handling
    if (task == null) {
      return res
        .status(404)
        .json({ message: "Task doesn't exist", data: null });
    }

    res.status(200).json({ message: "OK", data: task });
    // CastError
  } catch (error) {
    res.status(500).json({ message: "Internal server error", data: null });
  }
});

router.post("/", async (req, res) => {
  try {
    // Check required
    if (!req.body.name || !req.body.deadline) {
      return res
        .status(400)
        .json({ message: "Missing required fields", data: null });
    }

    // validate the user id
    if (
      req.body.assignedUser &&
      !mongoose.isValidObjectId(req.body.assignedUser)
    ) {
      return res.status(400).json({
        message: "Invalid user ID",
        data: null,
      });
    }

    // find the user task is assigned to
    const user = req.body.assignedUser
      ? await User.findById(req.body.assignedUser)
      : null;

    // if user doesn't exist --> error handling
    if (req.body.assignedUser && !user) {
      return res.status(404).json({
        message: "User not found",
        data: null,
      });
    }

    // assigned name matches user name?
    if (
      user &&
      req.body.assignedUserName !== undefined &&
      req.body.assignedUserName !== user.name
    ) {
      return res.status(400).json({
        message: "Assigned user's name doesn't match",
        data: null,
      });
    }
    let assignedName = "unassigned";

    // assign matched user name to user
    if (user) {
      assignedName = user.name;
    }

    // create the task + user id
    const task = new Task({
      name: req.body.name,
      description: req.body.description,
      deadline: req.body.deadline,
      completed: req.body.completed,
      assignedUser: req.body.assignedUser || "",
      assignedUserName: assignedName,
    });

    // save created task
    await task.save();

    // if task is assigned and incomplete --> add tasks id to users pending tasks list
    if (req.body.assignedUser && !task.completed) {
      await User.findByIdAndUpdate(req.body.assignedUser, {
        $addToSet: { pendingTasks: task.id.toString() },
      });
    }
    // Save the task
    return res.status(201).json({
      message: "Task created",
      data: task,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating/adding tasks", data: null });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    // retrieve docs from tasks collection
    const task = await Task.findById(req.params.id);

    // Error handling
    if (task == null) {
      return res
        .status(404)
        .json({ message: "Task doesn't exist", data: null });
    }

    // if task has an assigned user remove id's pending tasks
    if (task.assignedUser) {
      await User.findByIdAndUpdate(task.assignedUser, {
        $pull: { pendingTasks: task.id.toString() },
      });
    }
    // delete task
    await Task.findByIdAndDelete(req.params.id);

    return res.status(204).send();
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(404).json({
        message: "Invalid task ID",
        data: null,
      });
    }

    return res.status(500).json({
      message: "Error deleting task",
      data: null,
    });
  }
});

router.put("/:id", async (req, res) => {
  try {
    // find the exisiting task
    const task = await Task.findById(req.params.id);

    // ---- validation
    // does task exisit
    if (!task) {
      return res.status(404).json({
        message: "Task doesn't exist",
        data: null,
      });
    }

    // validate requried fields
    if (!req.body.name || !req.body.deadline) {
      return res.status(400).json({
        message: "Missing requried fields",
        data: null,
      });
    }

    // validate user id
    if (
      req.body.assignedUser &&
      !mongoose.isValidObjectId(req.body.assignedUser)
    ) {
      return res.status(400).json({
        message: "Invalid user ID",
        data: null,
      });
    }

    // find the user task is assigned to
    const user = req.body.assignedUser
      ? await User.findById(req.body.assignedUser)
      : null;

    // if user doesn't exist --> error handling
    if (req.body.assignedUser && !user) {
      return res.status(404).json({
        message: "User not found",
        data: null,
      });
    }

    // assigned name matches user name?
    if (
      user &&
      req.body.assignedUserName !== undefined &&
      req.body.assignedUserName !== user.name
    ) {
      return res.status(400).json({
        message: "Assigned user's name doesn't match",
        data: null,
      });
    }
    let assignedName = "unassigned";

    // assign matched user name to user
    if (user) {
      assignedName = user.name;
    }

    // ---- validation

    // remove task from old users pending list
    if (task.assignedUser) {
      // this is the old user
      await User.findByIdAndUpdate(task.assignedUser, {
        $pull: { pendingTasks: task.id.toString() },
      });
    }

    // retrieve docs from users collection
    const updatedTask = await Task.findByIdAndUpdate(
      req.params.id,
      {
        name: req.body.name,
        description: req.body.description,
        deadline: req.body.deadline,
        completed: req.body.completed,
        assignedUser: req.body.assignedUser,
        assignedUserName: assignedName,
      },
      {
        new: true, // returns the new updated user
        runValidators: true, // does update run on schema rules
      },
    );

    // add task to new user's pending list
    if (updatedTask.assignedUser && !updatedTask.completed) {
      await User.findByIdAndUpdate(updatedTask.assignedUser, {
        $addToSet: { pendingTasks: updatedTask.id.toString() },
      });
    }

    // return the user
    return res
      .status(200)
      .json({ message: "Success: Task updated!", data: updatedTask });
  } catch (error) {
    res.status(500).json({ message: "Can't update user", data: null });
  }
});

module.exports = router;
