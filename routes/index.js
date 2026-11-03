/*
 * Connect all of your endpoints together here.
 */
module.exports = function (app, router) {
  // Import user and mount to the route
  app.use("/api", require("./home.js")(router));
  app.use("/api/users", require("./users.js"));
  app.use("/api/tasks", require("./tasks.js"));
};
