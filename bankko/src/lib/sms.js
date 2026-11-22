'use strict';
// Placeholder for the SMS gateway (Lab 03 external service). Replace the body with a real provider call.
const config = require('../config');

const maskPhone = (p) => (p.length >= 7 ? `${p.slice(0, 4)} *** ${p.slice(-4)}` : '***');

async function sendOtpSms(phone, otp) {
  if (config.devShowOtp) {
    console.log(`[SMS:dev] to ${maskPhone(phone)} -> your Bankko code is ${otp} (valid ${config.otp.ttlSeconds / 60} min)`);
    return;
  }
  throw new Error('SMS gateway is not configured.');
}
module.exports = { sendOtpSms, maskPhone };
