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


/* APPLICATION */
const hostname = "http://localhost:3000";

app.get("/", connectUser(), getAccessToken(), async (req, res, next) => {
  // Get all Account
  let accounts = [];
  let page = 0;
  let totalPages = 0;
  do {
    /***** BUG sur l'api, la variable resp.link.next ne devient pas null alors que la data reste la même *****/
    let [errResp, resp] = await asyncPromise(getAccounts(res.accessToken, ++page));
    if(errResp) return sendError(errResp, res);

    let lastAccountId = resp.account[resp.account.length -1].acc_number
    let unique = accounts.find(el => el.acc_number == lastAccountId);
    if(unique) break;

    accounts = accounts.concat(resp.account);
    if (resp.link.next != null) totalPages = page;
  } while (page == totalPages)

  // Get all Transaction by Account
  let count = -1;
  while (accounts[++count]) {
    let transactions = [];
    page = 0;
    totalPages = 0;

    do {
      let [errResp, resp] = await asyncPromise(getTransactions(res.accessToken, accounts[count], ++page));
      if (errResp) return sendError(errResp, res); 
      if (resp.messageError) {
        transactions = resp;
        break;
      }
      transactions = transactions.concat(resp.transactions);
      if (resp.link.next != null) totalPages = page;
    } while (page == totalPages)

    let uniqueTransaction = transactions;
    console.log(uniqueTransaction);
    if (transactions.length) uniqueTransaction = [...new Map(transactions.map((item) => [item.id, item])).values()];
    accounts[count].transaction = uniqueTransaction;
  }

  return res.send(accounts);
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

function getAccounts(accessToken, numPage = 1) {
  return new Promise((resolve, reject) => {
    request.get({
      url: `${hostname}/accounts?page=${numPage}`,
      headers: {
        "Content-Type": "application/json",
        Authorization: 'Bearer ' + accessToken
      },
    }, function (err, httpResponse, body) {
      if (err) return reject(err);
      let result = JSON.parse(body)
      return resolve(result);
    })
  })
}

function getTransactions(accessToken, account, numPage = 1) {
  return new Promise((resolve, reject) => {
    let url = `${hostname}/accounts/${account.acc_number}/transactions?page=${numPage}`;
    request.get({
      url,
      headers: {
        "Content-Type": "application/json",
        Authorization: 'Bearer ' + accessToken
      },
    }, function (err, httpResponse, body) {
      if (err) return reject(err);
      if (httpResponse.statusCode == 400) return resolve({ messageError: `Account ${account.acc_number} NOT found !`, });
      let myTransactions = JSON.parse(body);
      return resolve(myTransactions);
    })
  })
}

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
