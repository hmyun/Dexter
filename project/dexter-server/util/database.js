/**
 * Copyright (c) 2014 Samsung Electronics, Inc.,
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * * Redistributions of source code must retain the above copyright notice, this
 *   list of conditions and the following disclaimer.
 *
 * * Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

"use strict";
var mysql = require("mysql");
var logging = require('./logging');
var util = require('./dexter-util');
var _databasePool;


var _runOptions;
exports.init = function(runOptions){
    _runOptions = runOptions;

    setRunOptionsImmutable();
    initDatabase();
};

function setRunOptionsImmutable(){
    Object.freeze(_runOptions);
}

exports.getProjectName = function(req, res){
    res.send({
        result: _runOptions.databaseName
    });
};

exports.deleteDexterDatabase = function(){
    // TODO : root account info from server.conf
    _runOptions.databaseAdminUser = 'dexterAdmin';
    _runOptions.databaseAdminPassword = "dex2admin";

    util.getLocalhostIp(function(localhostIp){
        var scripts = [
                "DROP DATABASE " + _runOptions.databaseName,
        ];

        runMysqlScript(scripts, 0);
    });
};


function initDatabase(){
    initDbPool();

    _databasePool.query('SELECT 1 + 1 As solution', function(err) {
        if(err){
            if(err.code === "ER_BAD_DB_ERROR"){
                logging.error("There is no proper Dexter Database. You have to create it first.");

                // TODO fix and test below codes
                //installDexterDatabase(); return;
            } else if (err.code === "ER_ACCESS_DENIED_ERROR") {
                logging.error("You can not access Dexter Database by account '" + _runOptions.databaseUser + "'.");
                logging.error("You have to create and grant an account for Dexter Database in MySql console.")
                logging.error("mysql> create user user_id identified by user_password;");
                logging.error("mysql> grant all on 'dexter_db_name'.* to 'user_id'@'dexter_server_ip' identified by 'user_password';");
                logging.error("mysql> flush privileges;");
            } else if(err.code === "ECONNREFUSED"){
                logging.error("There is no Mysql Instance. Please check your MySQL Connection : ");
            }

            logging.error(err);
            throw err;
        }
    });
}

function initDbPool(){
    _databasePool = mysql.createPool({
        /*    debug: true, */
        host : _runOptions.databaseHost,
        port : _runOptions.databasePort,
        user : _runOptions.databaseUser,
        password: _runOptions.databasePassword,
        database : _runOptions.databaseName
        /*connectTimeout: 10000 */
    });

    _databasePool.query('SELECT 1 + 1 AS solution', function(err) {
        if (err){
            logging.error('Dexter Database Connection Failed : ' + _runOptions.getDbUrl())
        } else {
            logging.info('Dexter Database Connected : ' + _runOptions.getDbUrl());
        }
    });
}

// TODO should move to dexter-monitor module.
function installDexterDatabase(){
    logging.info("There is no Dexter Database(" + _runOptions.databaseName + "). Thus Dexter Database will be installed.");

    util.getLocalhostIp(function(localhostIp){
        var scripts = [
                "CREATE DATABASE " + _runOptions.databaseName,
                "CREATE USER '" + _runOptions.databaseUser + "'@'" + localhostIp
                    + "' IDENTIFIED BY '" + _runOptions.databasePassword + "'",
                "GRANT ALL PRIVILEGES ON " + _runOptions.databaseName + ".* TO '" + _runOptions.databaseUser
                    + "'@'" + localhostIp + "' IDENTIFIED BY '" + _runOptions.databasePassword + "'"
        ];

        runMysqlScript(scripts, 0);
    });
}

function runMysqlScript(scripts, index){
    if(scripts.length <= index){
        return;
    }

    var cmd = "mysql -h " + _runOptions.databaseHost
        + " -u " + _runOptions.databaseAdminUser
        + " -p" + _runOptions.databaseAdminPassword + " -e \"" + scripts[index] + "\"";

    logging.info(cmd);

    var exec = require('child_process').exec;
    exec(cmd, function(error, stdout, stderr){
        if(error){
            if(error.code != 1){
                logging.error(error);
                logging.error("Execute Failed: " + cmd);
                return;
            }

            logging.error(error);
            process.exit(2);
        }

        logging.info("Executed: " + cmd);

        if(++index >= scripts.length){
            execMysqlScript(process.cwd() + "/config/ddl_lines.sql");
        } else {
            runMysqlScript(scripts, index);
        }
    });
}


function execMysqlScript(scriptFilePath){
    var cmd = "mysql -h " + _runOptions.databaseHost
        + " -u " + _runOptions.databaseUser
        + " -p" + _runOptions.databasePassword
        + " " + _runOptions.databaseName + " < " + scriptFilePath;

    var exec = require('child_process').exec;
    exec(cmd, function(error, stdout, stderr){
        if(error){
            /*
            if(error.code != 1){
                logging.error(error);
                logging.error("Execute Failed: " + cmd);
                return;
            }
            */

            logging.error(error);
            process.exit(3);
        }

        logging.info("Executed: " + cmd);
        initDbPool();
    });
}

/*
function execMysqlCmd(script){
    var cmd = "mysql -h " + _runOptions.databaseHost
        + " -u " + _runOptions.databaseAdminUser
        + " -p" + _runOptions.databaseAdminPassword
        + " -e \"" + script + "\"";

    var exec = require('child_process').exec;
    exec(cmd, function(error, stdout, stderr){
        if(error){
            if(error.code != 1){
                logging.error(error);
                logging.error("Execute Failed: " + cmd);
                return;
            }
        }

        logging.info("Executed: " + cmd);
    });
}
*/


exports.getDatabaseName = function(){
    return _runOptions.databaseName;
};

exports.exec = function (sql, callback){
    _databasePool.getConnection(function(err, connection){
        if(err){
            logging.error(err.message);
        }

        if(connection){
            if(connection.isClosed){
                logging.error("Invalid DB Connection : closed");
            }

            var query = connection.query(sql, callback);
            logging.debug(sql);
            connection.release();
        }
    });
};

exports.execTx = function (connection, sql, callback){
    if(connection){
        if(connection.isClosed){
            logging.error("Invalid DB Connection : closed");
        }

        var query = connection.query(sql, callback);
        logging.debug(sql);
    }
};

exports.toSqlValue = function(value){
    if(value == undefined || value == null || value === 'null' || value === ''){
        return "null";
    } else {
        var str = "" + value;
        return "'" + str.replace(/\'/g, "/") + "'";
    }
};

exports.compareEqual = function(value){
    if(value == undefined || value == 'null' || value == ''){
        return " is null ";
    } else {
        return " = '" + value + "'";
    }
};

exports.getDateTime = function(value){
    var retValue;

    if(typeof value.getTime === 'function'){
        retValue = value.getTime();
    } else if (typeof value === 'number'){
        retValue = value;
    } else if(typeof value === 'string') {
        if(value.indexOf("T") !== -1){
            var date = parseDate(value);
            retValue = date.getTime();
        } else {
            retValue = value;
        }
    } else {
        logging.error("Invalid value at database.js getDateTime : " + value + " , typeof:" + typeof value);
        retValue = 0;
    }

    return retValue;
};

exports.getDateTimeEx = function(value) {
    var retValue;
    if(typeof value.getTime === 'function'){
        retValue = "FROM_UNIXTIME(" + Math.floor(value.getTime()/1000) + ")";
    } else if(typeof value === 'number') {
        retValue = "FROM_UNIXTIME(" + Math.floor(value/1000) + ")";
    } else if(typeof value === 'string') {
        if(value.indexOf("T") !== -1){
            var date = parseDate(value);
            retValue = "FROM_UNIXTIME(" + Math.floor(date.getTime()/1000) + ")";
        } else {
            retValue = "FROM_UNIXTIME(" + Math.floor(value/1000) + ")";
        }
    } else {
        logging.error("Invalid value at database.js getDateTimeEx : " + value + " , typeof:" + typeof value)
        retValue = "0";
    }

    return retValue;
};