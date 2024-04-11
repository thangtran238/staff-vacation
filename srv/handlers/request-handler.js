const cds = require("@sap/cds");
const cron = require("node-cron");
const { SELECT, UPDATE, INSERT } = cds.ql;
const { Users, Requests } = cds.entities;
const requestHandler = {
  create: async (req) => {
    try {
      const startDay = new Date(req.data.startDay);
      const endDay = new Date(req.data.endDay);
      const currentDate = new Date();

      if (startDay < currentDate || endDay < currentDate) {
        return req.reject(
          400,
          "Start day and end day must be after the current date."
        );
      } else if (endDay <= startDay) {
        return req.reject(400, "End day must be after start day.");
      }
      const daysOff = getAllDaysBetween(startDay,endDay).length
      const user = await SELECT.one.from(Users).where({ID:req.data.authentication.id})
      if (daysOff>(user.dayOffThisYear+user.dayOffLastYear)) {
        await INSERT.into(Requests).entries({
          reason: req.data.reason,
          startDay: req.data.startDay,
          endDay: req.data.endDay,
          isOutofDay:true,
          user_ID: req.data.authentication.id,
        }); 
      }
      else {
        await INSERT.into(Requests).entries({
          reason: req.data.reason,
          startDay: req.data.startDay,
          endDay: req.data.endDay,
          user_ID: req.data.authentication.id,
        });
      };
      return req.info(201,'request sent successfully')
    } catch (error) {
      req.error({
        code: error.code || 500,
        message: error.message || "Internal Server Error",
      });
    }
  },

  update: async (req) => {
    try {
      const findRequest = await SELECT.one
        .from(Requests)
        .where({ ID: req.data.ID });
      if (!findRequest) {
        return req.reject(404, "Couldn't find this request to update.");
      }
      if (findRequest.status !== "pending") {
        return req.reject(403, "Cannot update request");
      }
      await cds
      .update(Requests)
      .set({ reason: req.data.reason})
      .where({ ID: req.data.ID});

    return req.info(200, `update successfully`);
    } catch (error) {
      console.error("Error occurred during request update:", error);
      return req.reject(
        error.status || 500,
        error.message || "Internal Server Error"
      );
    }
  },

  remove: async (req) => {
    try {
      const findRequest = await SELECT.one
        .from(Requests)
        .where({ ID: req.data.ID });
      if (!findRequest) {
        return req.reject(404, "Request not found");
      }
      if (findRequest.status !== "pending") {
        return req.reject(403, "Cannot delete request");
      }
      await cds.run(DELETE.from(Requests).where({ ID: req.data.ID }));
      return req.info(200, `delete successfully !`);
    } catch (error) {
      console.error("Error occurred during request deletion:", error);
      return req.reject(
        error.status || 500,
        error.message || "Internal Server Error"
      );
    }
  },
  recalculateVacationDays: async () => {
    try {
      const allUsers = await SELECT.from(Users);
      for (const user of allUsers) {
        let dayOffThisYear = user.dayOffThisYear;
        let dayOffLastYear = user.dayOffLastYear;
        if (dayOffThisYear === 0) {
          dayOffLastYear = 0;
          dayOffThisYear = 12 * 1.25;
        } else if (dayOffThisYear > 0 && dayOffThisYear <= 5) {
          dayOffLastYear = dayOffThisYear;
          dayOffThisYear = 12 * 1.25;
        } else if (dayOffThisYear > 5) {
          dayOffLastYear = 5;
          dayOffThisYear = 12 * 1.25;
        }
        await UPDATE(Users)
          .set({ dayOffThisYear, dayOffLastYear })
          .where({ ID: user.ID });
      }
    } catch (error) {
      return { status: 500, message: error };
    }
  },

  refreshDayOffLastYear: async () => {
    try {
      const allUsers = await SELECT.from(Users);
      for (const user of allUsers) {
        await UPDATE(Users).set({ dayOffLastYear: 0 }).where({ ID: user.ID });
      }
    } catch (error) {
      return { status: 500, message: error };
    }
  },
};
const getAllDaysBetween = (startDay, endDay) => {
  const days = [];
  let currentDate = new Date(startDay);
  for (
    let date = currentDate;
    date <= endDay;
    date.setDate(date.getDate() + 1)
  ) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    days.push(`${year}-${month}-${day}`);
  }
  console.log(days);
  return days;
};

cron.schedule("59 23 31 12 *", async () => {
  await requestHandler.recalculateVacationDays();
  return req.info(  200, "Vacation days recalculated successfully." );
});
cron.schedule("59 23 31 3 *", async () => {
  await requestHandler.refreshDayOffLastYear();
  return req.info(  200, "refresh DayOffLastYear successfully." );
});

module.exports = requestHandler;
