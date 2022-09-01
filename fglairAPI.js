// FGLair API, (c) 2022 Jean-Philippe Lord, MIT License (see below)

// Portions of this software adapted from the pyfujitsu project
// Copyright (c) 2018 Mmodarre https://github.com/Mmodarre/pyfujitsu


/*                          MIT License
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.*/
var https = require('https');
var http = require('http');
var crypto = require("crypto");
var utf8 = require("utf8");

var log = console.log;
var access_token = '';
var devices_dsn = [];
var username = '';
var user_pwd = '';

var key_exchange_ver = '';
var key_exchange_random_1 = '';
var key_exchange_time_1 = '';
var key_exchange_proto = '';
var key_exchange_key_id = '';

var enc_sign_key = null;
var enc_crypto_key = null;
var enc_iv_seed = null;
var dec_sign_key = null;
var dec_crypto_key = null;
var dec_iv_seed = null;

var seq_no = -1;
var cmd_id = -1;

var options_auth = {
    hostname: "user-field.aylanetworks.com",
    port: 443,
    path: "/users/sign_in.json",
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    }
}

var options = {
    hostname: "ads-field.aylanetworks.com",
    port: 443,
    path: "/apiv1/",
    method: 'GET',
    headers: {
        'Content-Type': 'application/json',
    }
}
var appID = {
    app_id: "CJIOSP-id",
    app_secret: "CJIOSP-Vb8MQL_lFiYQ7DKjN0eCFXznKZE"
}


class Queue {

  constructor() { this.q = []; }
  send( item )  { this.q.push( item ); }
  receive()     { return this.q.shift(); }
  awaiting()    { return this.q.length; }
}

class Decrypt {

  constructor() {
  }
  updatekey(dec_crypto_key_parm, dec_iv_seed_parm) {
      this.decryptobj = crypto.createDecipheriv('aes-256-cbc', dec_crypto_key_parm, dec_iv_seed_parm);
      this.decryptobj.setAutoPadding(false);
  }
  decrypt(data)     { return this.decryptobj.update(data, 'base64').toString('utf8').replace(/^\0+/, '').replace(/\0+$/, ''); }

}

class Encrypt {

  constructor() {
  }
  updatekey(enc_crypto_key_parm, enc_iv_seed_parm) {
      this.encryptobj = crypto.createCipheriv('aes-256-cbc', enc_crypto_key_parm, enc_iv_seed_parm);
      this.encryptobj.setAutoPadding(false);
  }
  encrypt(data)     { return this.encryptobj.update(zeroPad(data,16)); }

}

const decrypt = new Decrypt();
const encrypt = new Encrypt();

const queue1 = new Queue();


//function encrypt(data) {
//    log('encrypt1');
//    encryptobj = crypto.createCipheriv('aes-256-cbc', enc_crypto_key, enc_iv_seed);
//    encryptobj.setAutoPadding(false);
//    encrypted = encryptobj.update(zeroPad(data,16));
//    encrypted = Buffer.concat([encrypted, encryptobj.final()]);
//    return encrypted;
//};

//function decrypt(data) {
//    decryptobj = crypto.createDecipheriv('aes-256-cbc', dec_crypto_key, dec_iv_seed);
//    decryptobj.setAutoPadding(false);
//    //decrypted = decrypt.update(data, 'base64', 'utf8') + decrypt.final('utf8');
//    decrypted = decryptobj.update(data, 'base64');
//    decrypted = Buffer.concat([decrypted, decryptobj.final()]);
//    return decrypted.toString('utf8').replace('\0', '');
//}

function zeroPad(text, bs) {
    var padLength = text.length;
    if (text.length % bs > 0){
      padLength += bs - text.length % bs;
    }
    return text.padEnd(padLength, '\0');
}

function build_key(lanipkey, msg) {
    buff1 = Buffer.from(msg, 'utf-8');
    buff2 = Buffer.concat([hmac(lanipkey,msg), buff1]);
    return hmac(lanipkey,buff2);
}

function hmac(key, msg) {
    return crypto.createHmac("sha256", key).update(msg).digest();
}

function build_all_keys(lanipkey, random_1, random_2, time_1, time_2) {
    enc_sign_key = build_key(lanipkey, random_1 + random_2 + time_1 + time_2 + "0");
    enc_crypto_key = build_key(lanipkey, random_1 + random_2 + time_1 + time_2 + "1");
    enc_iv_seed = build_key(lanipkey, random_1 + random_2 + time_1 + time_2 + "2").slice(0, 16);
    dec_sign_key = build_key(lanipkey, random_2 + random_1 + time_2 + time_1 + "0");
    dec_crypto_key = build_key(lanipkey, random_2 + random_1 + time_2 + time_1 + "1");
    dec_iv_seed = build_key(lanipkey, random_2 + random_1 + time_2 + time_1 + "2").slice(0, 16);
}


function set_region(region) {
    if (region == 'eu') {
        options_auth['hostname'] = "user-field-eu.aylanetworks.com";
        options['hostname'] = "ads-field-eu.aylanetworks.com";
        appID['app_id'] = "FGLair-eu-id";
        appID['app_secret'] = "FGLair-eu-gpFbVBRoiJ8E3QWJ-QRULLL3j3U"
    } else if (region == 'cn') {
        options_auth['hostname'] = "user-field.ayla.com.cn";
        options['hostname'] = "ads-field.ayla.com.cn";
        appID['app_id'] = "FGLairField-cn-id";
        appID['app_secret'] = "FGLairField-cn-zezg7Y60YpAvy3HPwxvWLnd4Oh4"
    } else {
        //use the defaults

    }

}

function read_devices_options(token) {
    let temp_options = options;

    temp_options['method'] = 'GET';
    temp_options['path'] = "/apiv1/" + "devices.json"
    if (token != '')
        temp_options['headers']['Authorization'] = 'auth_token ' + token;
    return temp_options;
}

function read_properties_options(dsn, token) {
    let temp_options = options;

    temp_options['method'] = 'GET';
    temp_options['path'] = "/apiv1/dsns/" + dsn + "/properties.json";
    temp_options['headers']['Authorization'] = 'auth_token ' + token;
    return temp_options;
}

function read_property_options(prop_key, token) {
    let temp_options = options;

    temp_options['method'] = 'POST';
    temp_options['path'] = "/apiv1/properties/" + prop_key + "/datapoints.json";
    temp_options['headers']['Authorization'] = 'auth_token ' + token;
    return temp_options;
}

function read_lanip(dsn, token) {
    let temp_options = options;

    temp_options['method'] = 'GET';
    temp_options['path'] = "/apiv1/dsns/" + dsn + "/lan.json";
    temp_options['headers']['Authorization'] = 'auth_token ' + token;
    return temp_options;
}


var fglair = {

    checkToken: function(token = '', callback) {
        if (token == '')
            return false;

        return true;
    },

    getDevices: function(token, callback) {
        let data = '';
        let opt = read_devices_options(access_token)
        let req2 = https.request(opt, (res) => {
            //log(`statusCode: ${res.statusCode}`);
            res.on('data', (d) => {
                data += d;

            })
            res.on('end', () => {
                if (res.statusCode == 200) {
                    let data_json = JSON.parse(data);

                    data_json.forEach((dv) => {
                        //console.log(dv);
                        let dsn = dv['device']['dsn'];
                        devices_dsn.push(dsn);
                    });
                    log("Device: " + devices_dsn);
                    callback(null, devices_dsn);
                } else {
                    err = new Error("Get Devices Error");
                    log(err.message);
                    callback(err);
                }
            });
        }).on('error', (err) => {
            log("Error: " + err.message);
            callback(err);
        });
        req2.end();
    },

    getDeviceProp: function(dsn, callback) {
        let data = '';
        let opt = read_properties_options(dsn, access_token)
        let req2 = https.request(opt, (res) => {
            //log(`statusCode: ${res.statusCode}`);
            res.on('data', (d) => {
                data += d;

            })
            res.on('end', () => {
                if (res.statusCode == 200) {
                    let data_json = JSON.parse(data);
                    callback(null, data_json);
                } else {
                    //auth_token expired...
                    access_token = '';
                    log("Getting new token...");
                    fglair.getAuth(username, user_pwd, (err, data) => {
                        err = new Error("Auth expired");
                        log("Error: " + err.message);
                        callback(err);
                    });


                }
            });
        }).on('error', (err) => {
            log("Error: " + err.message);
            callback(err);
        });
        req2.end();

    },

    getDeviceLanIp: function(dsn, callback) {
        let data = '';
        let opt = read_lanip(dsn, access_token)
        let req2 = https.request(opt, (res) => {
            //log(`statusCode: ${res.statusCode}`);
            res.on('data', (d) => {
                data += d;

            })
            res.on('end', () => {
                if (res.statusCode == 200) {
                    let data_json = JSON.parse(data);
                    callback(null, data_json);
                } else {
                    //auth_token expired...
                    access_token = '';
                    log("Getting new token...");
                    fglair.getAuth(username, user_pwd, (err, data) => {
                        err = new Error("Auth expired");
                        log("Error: " + err.message);
                        callback(err);
                    });


                }
            });
        }).on('error', (err) => {
            log("Error: " + err.message);
            callback(err);
        });
        req2.end();
    },

    setDeviceProp: function(property_key, val, callback) {
        let data = '';
        let body = '{\"datapoint\": {\"value\": ' + val + ' } }';
        let opt = read_property_options(property_key, access_token)
        let req = https.request(opt, (res) => {
            //log(`Write Property statusCode: ${res.statusCode}`);
            res.on('data', (d) => {
                data += d;
            })
            res.on('end', () => {
                callback(null)
            });
        }).on('error', (err) => {
            log("Error: " + err.message);
            callback(err);
        });
        req.write(body);
        req.end();
    },

    createServer: function(serverip, port, lanipkey, deviceip, callback) {

        var server = http.createServer((req, res, data) => {
            log.debug("Incoming Request: " + req.url);

            if (req.method == 'GET' && req.url == '/local_lan/commands.json') {

		if (typeof (i = queue1.receive()) == 'undefined') {
                    i = { type: "get", data: { "property": 'display_temperature'}};
                }
                    seq_no++;
                    cmd_id++;
                    res.setHeader('Content-Type', 'application/json; charset=utf-8');
                    if ( i['type'] == "get" ) {
                        buildmsg = ({
                            "seq_no": seq_no,
                            "data": {
                                        "cmds": [
                                                    {
                                                        "cmd": {
                                                                   "method": "GET",
                                                                   "resource": "property.json?name=" + i['data']['property'],
                                                                   "uri": "/local_lan/property/datapoint.json",
                                                                   "data": "",
                                                                   "cmd_id": cmd_id
                                                               }
                                                    }
                                                ]
                                    }
                        });
                    } 

                    if ( i['type'] == "set" ) {

                        buildmsg = ({
                            "seq_no": seq_no,
                            "data": {
                                        "properties": [
                                                          {
                                                              "property": {
                                                                               "base_type": i['data']['base_type'],
                                                                               "name": i['data']['property'],
                                                                               "value": i['data']['value'],
                                                                               "id": crypto.randomBytes(4).toString('hex').slice(0, 8)
                                                               }
                                                          }
                                                      ]
                                    }
                        });
                    } 

                    buildmsgJSON = JSON.stringify(buildmsg);
                    log.debug("Request to unit: " + buildmsgJSON);
                    response = ({
                        "enc": encrypt.encrypt(buildmsgJSON).toString('base64'),
                        "sign": hmac(enc_sign_key, buildmsgJSON).toString('base64')
                    });
                    //log(JSON.stringify(response));
                    res.end(JSON.stringify(response));
            }
            if (req.method == 'POST') {
                var body = '';

                req.on('data', function(data) {
                    body += data;

                    // Too much POST data, kill the connection!
                    // 1e6 === 1 * Math.pow(10, 6) === 1 * 1000000 ~~~ 1MB
                    //if (body.length > 1e6)
                    //    request.connection.destroy();
                });

                req.on('end', function() {

                    if (req.url == '/local_lan/key_exchange.json') {
                            key_exchangeJSON = JSON.parse(body);
                            //log(body);
                            key_exchange_ver = key_exchangeJSON['key_exchange']['ver'];
                            key_exchange_random_1 = key_exchangeJSON['key_exchange']['random_1'];
                            key_exchange_time_1 = key_exchangeJSON['key_exchange']['time_1'];
                            key_exchange_proto = key_exchangeJSON['key_exchange']['proto'];
                            key_exchange_key_id = key_exchangeJSON['key_exchange']['key_id'];
                            // prepare response
                            key_exchange_random_2 = crypto.randomBytes(8).toString('hex').slice(0, 16);
                            key_exchange_time_2 = Number(process.hrtime.bigint() % BigInt(2 ** 40));
                            //key_exchange_random_2 = 'hsk5rsELnEhdqy8h';
                            //key_exchange_time_2 = '640295852322';
                            //log(key_exchange_random_2);
                            //log(key_exchange_time_2);
                            resBody = JSON.stringify({
                                random_2: key_exchange_random_2,
                                time_2: key_exchange_time_2
                            });
                            res.writeHead(200, {
                                'Content-Type': 'application/json; charset=utf-8',
                                'Content-Length': resBody.length
                            });
                            res.end(resBody);
                            //log(resBody);
                            build_all_keys(lanipkey, key_exchange_random_1, key_exchange_random_2, key_exchange_time_1, key_exchange_time_2);
                            //log(lanipkey, key_exchange_random_1, key_exchange_random_2, key_exchange_time_1, key_exchange_time_2);
                            encrypt.updatekey(enc_crypto_key, enc_iv_seed);
                            decrypt.updatekey(dec_crypto_key, dec_iv_seed);                            

                            queue1.send({ type: "get", data: { "property": 'display_temperature'}});
                            queue1.send({ type: "get", data: { "property": 'operation_mode'}});
                            queue1.send({ type: "get", data: { "property": 'adjust_temperature'}});
                            queue1.send({ type: "get", data: { "property": 'fan_speed'}});
                            queue1.send({ type: "get", data: { "property": 'af_vertical_swing'}});
                    }

                    if (req.url.startsWith('/local_lan/property/datapoint.json')) {
                            receiveresult = JSON.parse(body);
                            //log(receiveresult);
                            decryptedmessage = decrypt.decrypt(receiveresult['enc']);
                            log.debug("Received property update: " + decryptedmessage);
                            sign = hmac(dec_sign_key, decryptedmessage).toString('base64');
                            if (sign != receiveresult['sign']) {
                               //log(sign);
                               //log(receiveresult['sign']);
                               log("Datapoint Signature error");
                            } else {
                               resBody = '';
                               res.writeHead(200, {
                                   'Content-Type': 'application/octet-stream',
                                   'Content-Length': resBody.length
                               });
                               res.end(resBody);
                               //trigger update
                               callback(null, req.url, decryptedmessage);
                               if (queue1.awaiting() > 0) {
                                   fglair.keepaliveLocal(false, deviceip, serverip, port);
                               }

                            }
                    }

                    if (req.url == '/local_lan/property/datapoint/ack.json') {

                            receiveresult = JSON.parse(body);
                            decryptedmessage = decrypt.decrypt(receiveresult['enc']);
                            //log(decryptedmessage);
                            log.debug("Received ACK: " + decryptedmessage);
                            sign = hmac(dec_sign_key, decryptedmessage).toString('base64');
                            if (sign != receiveresult['sign']) {
                               //log(sign);
                               //log(receiveresult['sign']);
                               log("ACK Signature error");
                            } else {
                               resBody = '';
                               res.writeHead(200, {
                                   'Content-Type': 'application/octet-stream',
                                   'Content-Length': resBody.length
                               });
                               res.end(resBody);
                               //trigger update
                               //callback(null, req.url, decryptedmessage);
                               //if (queue1.awaiting() > 0) {
                               //    fglair.keepaliveLocal();
                               //}

                            }
                    }

                    //callback(null, req.url, body);
                });
            }

        }).listen(port, serverip);


        // Maintain a hash of all connected sockets
        var sockets = {},
            nextSocketId = 0;
        server.on('connection', function(socket) {
            // Add a newly connected socket
            var socketId = nextSocketId++;
            sockets[socketId] = socket;
            //log('socket', socketId, 'opened');

            // Remove the socket when it closes
            socket.on('close', function() {
                //log('socket', socketId, 'closed');
                delete sockets[socketId];
            });

            // Extend socket lifetime for demo purposes
            socket.setTimeout(4000);
        });




    },

    addtoqueue: function(item, callback) {
        queue1.send(item);
        //fglair.keepaliveLocal(false);
        //fglair.keepaliveLocal(false, unithostname, localserverip, localserverport);
        callback(null);
    },

    //keepaliveLocal: function(firstconnect, deviceip, serverip, port) {
    keepaliveLocal: function(firstconnect, unithostname, localserverip, localserverport, callback) {
        log.debug('Keep Alive: unit: ' + unithostname);
        if (queue1.awaiting() > 0) {
            notify = 1;
        } else {
            notify = 0;
        }

        if (firstconnect===true) {
            method = "POST";
        } else {
            method = "PUT";
        }

        data = ({ local_reg: {
                      "ip": localserverip,
                      "notify": notify,
                      "port": parseInt(localserverport),
                      "uri": '/local_lan'
                  }
        });
        dataJSON = JSON.stringify(data);
        log.debug("Keep Alive data: " + dataJSON)
        options = {
            hostname: unithostname,
            port: 80,
            path: '/local_reg.json',
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': dataJSON.length
            }
        }
        req = http.request(options, res => {
            //console.log(`statusCode: ${res.statusCode}`)

            res.on('data', d => {
                //process.stdout.write(d)
            })
        })

            req.on('error', error => {
                log(error)
            })

        req.write(dataJSON);
        req.end();
    },

    getAuth: function(user, password, callback) {
        username = user;
        user_pwd = password;
        if (access_token == '') {
            //var body = `{\r\n    \"user\": {\r\n        \"email\": \"${user}\",\r\n        \"application\":{\r\n            \"app_id\": \"CJIOSP-id\",\r\n            \"app_secret\": \"CJIOSP-Vb8MQL_lFiYQ7DKjN0eCFXznKZE\"\r\n        },\r\n        \"password\": \"${password}\"\r\n    }\r\n}`;
            var body = `{\"user\": {\"email\": \"${user}\", \"application\":{\"app_id\": \"${appID.app_id}\",\"app_secret\": \"${appID.app_secret}\"},\"password\": \"${password}\"}}`;
            const req = https.request(options_auth, (res) => {
                //log(`statusCode: ${res.statusCode}`);
                res.on('data', (d) => {
                    access_token = JSON.parse(d)['access_token'];
                    log("API Access Token: " + access_token);
                    callback(null, access_token);
                })

            })

            req.on('error', (error) => {
                log("Error: " + error);
                callback(error, null);

            })

            req.write(body);
            req.end();
        } else {
            log("API Using Access Token: " + access_token);
            callback(null, access_token);
        }

    },

    setLog: function(logfile) {
        log = logfile;
    },

    setToken: function(token) {
        access_token = token;
    },

    setRegion: function(region) {
        set_region(region);
    }

}

module.exports = fglair;
