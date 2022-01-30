function nowTime() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    const str = now.toISOString().slice(0, -1);
    return str;
}

module.exports = nowTime;