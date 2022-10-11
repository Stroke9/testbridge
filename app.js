var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const fs = require("fs");
const request = require("request");

var app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// String.prototype.replaceAll = function (search, replacement) {
//   var target = this;
//   return target.split(search).join(replacement);
// };
// function findInDir(dir, filter) {
//   const files = fs.readdirSync(dir);
//   files.forEach((file) => {
//     const filePath = path.join(dir, file);
//     if (fs.lstatSync(filePath).isDirectory()) {
//       findInDir(filePath, filter);
//     } else if (filter.test(filePath)) {
//       let myFile = filePath;
//       if (myFile.indexOf("route_") > -1) {
//         let file_ = filePath.replace(process.env.PWD + "/routes", "").replace("route_", "").replace(".js", "").replaceAll('\\', '/');
//         file_ == "/index" ? file_ = "/" : file_;
//         app.use(file_, require(filePath));
//         console.log(file_);
//       }
//     }
//   });
// }
// console.log('Routes List:')
// findInDir(process.env.PWD + "/routes", /\.js$/)

const hostname = "http://localhost:3000";

app.get("/", connectUser(), getAccessToken(), getAccounts(), (req, res, next) => {
  let promises = [];
  res.accounts.map(async el => {
    promises.push(getTransactions(el, res.accessToken));
  });

  Promise.all(promises).then((transaction) => {
    return res.send(transaction)
  }).catch(err => {
    return sendError(err, res);
  })
})

function connectUser() {
  return (req, res, next) => {
    var base64encodedData = Buffer.from("BankinClientId" + ':' + "secret").toString('base64');
    request.post({
      url: `${hostname}/login`,
      headers: {
        "Content-Type": "application/json",
        Authorization: 'Basic ' + base64encodedData
      },
      body: JSON.stringify({
        "user": "BankinUser",
        "password": "12345678"
      })
    }, function (err, httpResponse, body) {
      if (err) return sendError(err, res);
      let result = JSON.parse(body)
      res.refreshToken = result.refresh_token
      next();
    })
  }
}

function getAccessToken() {
  return (req, res, next) => {
    var details = {
      grant_type: "refresh_token",
      refresh_token: res.refreshToken
    };

    var formBody = [];
    for (var property in details) {
      var encodedKey = encodeURIComponent(property);
      var encodedValue = encodeURIComponent(details[property]);
      formBody.push(encodedKey + "=" + encodedValue);
    }
    formBody = formBody.join("&")

    request.post({
      url: `${hostname}/token`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody
    }, function (err, httpResponse, body) {
      if (err) return sendError(err, res);
      let result = JSON.parse(body)
      res.accessToken = result.access_token
      next();
    })
  }
}

function getAccounts() {
  return (req, res, next) => {
    request.get({
      url: `${hostname}/accounts?page=4`,
      headers: {
        "Content-Type": "application/json",
        Authorization: 'Bearer ' + res.accessToken
      },
    }, function (err, httpResponse, body) {
      if (err) return sendError(err, res);
      let result = JSON.parse(body)
      res.accounts = result.account
      next();
    })
  }
}

function getTransactions(account, accessToken, numPage) {
  return new Promise((resolve, reject) => {
    let url = `${hostname}/accounts/${account.acc_number}/transactions?page${numPage}`;
    request.get({
      url,
      headers: {
        "Content-Type": "application/json",
        Authorization: 'Bearer ' + accessToken
      },
    }, function (err, httpResponse, body) {
      if(err) return reject(err);
      if (httpResponse.statusCode == 400) return resolve({account: `${account.acc_number} NOT found !`,});
      let myTransactions = JSON.parse(body);
      const uniqueTransaction = [...new Map(myTransactions.transactions.map((item) => [item.id, item])).values()];

      return resolve({
        ...account,
        transactions: uniqueTransaction
      });
    })
  })
}


// function getAllTransaction() {
//   return new Promise((resolve, reject) => {
//     let allTransactions = [];
//     res.accounts.map(async el => {
//       let [errTransaction, transaction] = await asyncPromise(getTransactions(el.acc_number, res.accessToken));
//       if (errTransaction) return sendError("Une erreur est survenue", res);
//       allTransactions.push(transaction);
//     });
//   })
// }


// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

let asyncPromise = promise =>
  promise
    .then(data => ([false, data]))
    .catch(error => {
      console.error(error);
      return Promise.resolve([error, false]);
    });

let sendError = (err, res, status = 404) => {
  if (typeof res === "undefined") throw {
    errorTrace: new Error("res is not defined"),
    targetError: err
  }
  res.status(status).send({ error: err });
  throw {
    path: res.req.baseUrl,
    message: err,
    errorTrace: new Error(),
  }
};


module.exports = app;
