const util = require('util');
const path = require('path');
const nodemailer = require('nodemailer');

const defsign = 'IH';

module.exports = {
  params: {},
  smtpOptions: {},
  smtpTransport: null,
  mailOptions: null,

  async start(plugin) {
    this.plugin = plugin;
    this.params = plugin.params.data;
    if (this.params.ppw) {
      this.params.pass = plugin.getPassword(this.params);
    }
    
    try {
      this.smtpOptions = getSmtpObj(this.params);
      this.smtpTransport = nodemailer.createTransport(this.smtpOptions);
    } catch (err) {
      this.terminate(1, err);
      return;
    }

    this.smtpTransport.verify(err => {
      this.smtpTransport.close();
      if (err) {
        this.terminate(1, err);
      } else plugin.log('smtpTransport.verify OK');
    });

    plugin.onSub('sendinfo', message => {
      plugin.log('Sub sendinfo data=' + util.inspect(message));
      /*
      if (message.data && typeof message.data == "object") {
        let attachments = getAttachments(message.data.img)
        this.sendMail(message.data.txt, message.data.sendTo, this.params, attachments);
      }
      */
      let attachments = getAttachments(message.img);
      this.sendMail(message.txt, message.sendTo, this.params, attachments);
      // if (!message.data) return;
    });
  },

  sendMail(text, sendTo, opt, attachments) {
    console.log('sendMail START');
    if (!sendTo || !opt) return;

    sendText = text;

    sendarr = formSendArray(sendTo);
    this.plugin.log('Mail to send:  ' + sendarr.length);
    console.log('Mail to send:  ' + sendarr.length);
    if (sendarr.length <= 0) return;

    this.mailOptions = {
      from: (opt.sender ? opt.sender : 'IH') + '<' + opt.user + '>', // sender address
      subject: getFirstWords(sendText, 3),
      to: sendarr[0].addr,
      text: sendText + '\n\n' + sendarr[0].sign,
      encoding: 'utf8'
    };
    idx = -1;
    console.log('mailOptions  ' + util.inspect(this.mailOptions));
    try {
      // create reusable transport method (opens pool of SMTP connections)
      this.smtpTransport = nodemailer.createTransport(this.smtpOptions);

      if (attachments && attachments.length > 0) {
        this.mailOptions.attachments = attachments;

        this.plugin.log('attachments ' + util.inspect(attachments));
        // mailOptions.html = 'Embedded image: <img src="cid:unique@12345"/>';
      }

      this.sendnext();
    } catch (e) {
      this.plugin.log('Email sending to ' + this.mailOptions.to + ' error: ' + getErrorStr(e));
    }
  },

  // send mail with defined transport object
  sendnext(error, response) {
    console.log('sendnext START');
    let logtxt = '';
    idx = idx + 1;

    if (idx > 0) {
      if (error) {
        logtxt = 'Email to ' + this.mailOptions.to + ' fail: ' + getErrorStr(error);
      } else {
        logtxt = 'Email ' + this.mailOptions.to + ' sent, id: ' + response.messageId;
      }
      this.plugin.log(logtxt);
    }

    if (idx < sendarr.length) {
      this.mailOptions.to = sendarr[idx].addr;
      this.mailOptions.text = sendText + '\n' + sendarr[idx].sign;
      const sendnext = this.sendnext.bind(this);
      this.smtpTransport.sendMail(this.mailOptions, sendnext);
    } else {
      // shut down the connection pool, no more messages
      this.smtpTransport.close();
      this.mailOptions - null;
      // console.log('Transport closed', 'config');
    }
  },

  terminate(code, err) {
    const txt = err ? 'ERROR smtpTransport.verify:' + util.inspect(err) : '';
    this.plugin.exit(code, txt);
  }
};

/**
 *
 * @param {*} sendTo
 *          sendTo as object: { addr:'xx.gmail.com', sign:'With all my love'}
 *          sendTo as array:  [{ addr:'xx.gmail.com', sign:'Best' },{ addr:'zz.mail.com' },...]
 *          sendTo as string: 'xx.gmail.com'
 *
 * @return {Array} with items:{addr, sign}
 */
function formSendArray(sendTo) {
  if (typeof sendTo == 'object') {
    if (!util.isArray(sendTo)) sendTo = [sendTo];
  } else if (typeof sendTo == 'string') {
    sendTo = [{ addr: sendTo }];
  } else return [];

  return sendTo.filter(item => item.addr).map(item => ({ addr: item.addr, sign: item.sign || defsign }));
}

function getSmtpObj(opt) {
  let result = {};
  if (!opt.user) throw { message: 'Options error: Empty user!' };
  if (!opt.pass) throw { message: 'Options error: Empty pass!' };

  result.auth = { user: opt.user, pass: opt.pass };

  if (opt.service.length > 1) {
    result.service = opt.service;
  } else {
    if (!opt.host) throw { message: 'Options error: Empty host!' };
    if (!opt.port) throw { message: 'Options error: Empty port!' };
    result.host = opt.host;
    result.port = opt.port;
    result.secureConnection = Number(opt.port) == 465 ? true : false;
    result.secure = Number(opt.port) == 465 ? true : false;
    result.tls = {
      rejectUnauthorized: false
    }
    result.requiresAuth = true;
  }
  return result;
}

function getAttachments(img) {
  if (!img) return '';

  let arr = util.isArray(img) ? img : [img];
  let id = String(Date.now());
  return arr.map((file, idx) => {
    return {
      filename: path.basename(file),
      path: file,
      cid: id + String(idx)
    };
  });
}

function getFirstWords(astr, qwords) {
  let str = allTrim(astr);
  let n = Number(qwords) > 0 ? Number(qwords) : 1;
  return str
    ? str
        .split(/\s+/)
        .slice(0, n)
        .join(' ')
    : '';
}

function allTrim(str) {
  return str && typeof str === 'string' ? str.replace(/^\s+/, '').replace(/\s+$/, '') : '';
}

function getErrorStr(error) {
  return typeof error == 'object' ? JSON.stringify(error.errno || error.message) : error;
}
