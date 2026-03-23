const schedule = require('node-schedule');

const scheduleReminder = (date, reminderCallback) => {
    schedule.scheduleJob(date, reminderCallback);
};

module.exports = scheduleReminder;