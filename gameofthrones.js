var _ = require('lodash');
var express = require('express');
var got = express();
var rp = require('request-promise');
var watson = require('watson-developer-cloud');
var jsonGOT = require('./character.json');
var microsoftAPI = 'https://api.projectoxford.ai/vision/v1.0/models/celebrities/analyze';
var VisualRecognitionV3 = require('watson-developer-cloud/visual-recognition/v3');
var moment = require('moment');
var Q = require('q');
var config = require(appRoot + '/config').gameofthrones;
var admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert(config.firebase.service_account),
  databaseURL: config.firebase.database_url
}, 'gameofthrones');

var visual_recognition = new VisualRecognitionV3({
    api_key: "needs credentials",
    version_date: '2016-05-19'
});

function firebaseWrite(imgUrl, data) {
    var time = moment().format("dddd, MMMM Do YYYY, h:mm:ss a");
    if (data[0].result) {
        status = data[0].result;
    } else if (data[1].result) {
        status = data[1].result;
    }
    admin.database().ref('/').push({
        url: imgUrl,
        status: status,
        time: time
    });
}

function ibm_call(params) {
    var holdingResults = [];
    var defer = Q.defer();
    visual_recognition.detectFaces(params, function(error, response) {
        if (error) {
            console.log(error);
            defer.reject(error);
        } else {
            defer.resolve(response);
        }
    })
    return defer.promise.then(function(response) {
        if (response.images[0].faces.length == 1) {
            var counter = response.images[0].faces
            var nameIbm = counter[0].identity.name;
            var personIbm = _.find(jsonGOT, function(o) {
                return o.actor == nameIbm;
            });
            holdingResults.push(personIbm)
            holdingResults.push({ 'result': 'success' });
            firebaseWrite(params['url'], holdingResults);
            return holdingResults
        } else if (response.images[0].faces.length > 1) {
            holdingResults.push({ 'result': 'too_many' });
            firebaseWrite(params['url'], holdingResults);
            return holdingResults
        } else {
            throw new Error('IBM failed')
        }
    }).catch(function(err) {
        console.log("IBMFAILED");
        return microsoft_call(params['url'])
    })
}

function microsoft_call(picture) {
    var options = {
        url: microsoftAPI,
        method: 'POST',
        json: true,
        headers: {
            'Ocp-Apim-Subscription-Key': "needs credentials",
            'content-type': 'application/json',
        },
        body: { url: picture }
    };
    return rp(options)
}

function microsoftCheck(parsedBody) {
    var holdingResults = [];
    var names = parsedBody.result.celebrities;
    if (names.length > 1) {

        holdingResults.push({ 'result': 'too_many' });
        return holdingResults

    } else {
        var nameMicro = names[0].name;
        var personMicro = _.find(jsonGOT, function(o) {
            return o.actor == nameMicro;
        });
        if (personMicro) {
            holdingResults.push(personMicro);
        } else {
            throw new Error("Non-GOT-Celbrity")
        }
        holdingResults.push({ 'result': 'success' });
        return holdingResults

    }

}

got.get('/thrones/ar', function(req, res) {
    var matchImage = req.param('picture');
    var params = {
        url: matchImage
    };
    var personIbm;
    ibm_call(params).then(function(response) {
        console.log(response)
        if (!response.requestId) {
            res.send(response)
        } else {
            return (response)
        }
    }).then(function(parsedBody) {
        if (parsedBody) {
            return microsoftCheck(parsedBody)
        }
    }).then(function(microsoftResponse) {
        if (microsoftResponse) {
            console.log(microsoftResponse);
            if (microsoftResponse[1].result == "success" || microsoftResponse[0].result == "too_many") {
                firebaseWrite(matchImage, microsoftResponse);
                res.send(microsoftResponse)
            } else {
                throw new Error("microsoft Fail");
            }
        }
    }).catch(function(err) {
        // console.log(err);
        res.sendStatus(400);
        var holdingResults = [];
        holdingResults.push({ 'result': 'fail_could_not_find' });
        firebaseWrite(matchImage, holdingResults);

    })

})


module.exports = got;
