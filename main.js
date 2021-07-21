/**
 * @Author: Daniel Gangl
 * @Date:   2021-07-17 13:26:54
 * @Last Modified by:   Daniel Gangl
 * @Last Modified time: 2021-07-21 11:37:43
 */
"use strict";

/*
 * Created with @iobroker/create-adapter v1.34.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");

// Load your modules here, e.g.:
// const fs = require("fs");
const timers = {};

const request = require("request");
const parseString = require("xml2js").parseString;

let states;
class Cybro extends utils.Adapter {
  /**
   * @param {Partial<utils.AdapterOptions>} [options={}]
   */
  constructor(options) {
    super({
      ...options,
      name: "cybro",
    });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    // this.on("objectChange", this.onObjectChange.bind(this));
    // this.on("message", this.onMessage.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }

  /**
   * Is called when databases are connected and adapter received configuration.
   */
  async onReady() {
    // Initialize your adapter here

    // The adapters config (in the instance object everything under the attribute "native") is accessible via
    // this.config:
    //this.config.scgiServer = "http://127.0.0.1:4000";
    //this.config.pollInterval = 100;
    this.log.info("configured scgi server url: " + this.config.scgiServer);
    this.log.info(
      "configured poll interval: " + this.config.pollInterval + " msec"
    );

    /*
		For every state in the system there has to be also an object of type state
		Here a simple template for a boolean variable named "testVariable"
		Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
		*/
    await this.setObjectNotExistsAsync("testVariable", {
      type: "state",
      common: {
        name: "testVariable",
        type: "boolean",
        role: "indicator",
        read: true,
        write: true,
      },
      native: {},
    });

    // In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
    this.subscribeStates("testVariable");
    // You can also add a subscription for multiple states. The following line watches all states starting with "lights."
    // this.subscribeStates("lights.*");
    // Or, if you really must, you can also watch all states. Don't do this if you don't need to. Otherwise this will cause a lot of unnecessary load on the system:
    // this.subscribeStates("*");

    /*
			setState examples
			you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
		*/
    // the variable testVariable is set to true as command (ack=false)
    await this.setStateAsync("testVariable", true);

    // same thing, but the value is flagged "ack"
    // ack should be always set to true if the value is received from or acknowledged from the target system
    await this.setStateAsync("testVariable", { val: true, ack: true });

    // same thing, but the state is deleted after 30s (getState will return null afterwards)
    await this.setStateAsync("testVariable", {
      val: true,
      ack: true,
      expire: 30,
    });

    // examples for the checkPassword/checkGroup functions
    let result = await this.checkPasswordAsync("admin", "iobroker");
    this.log.info("check user admin pw iobroker: " + result);

    result = await this.checkGroupAsync("admin", "admin");
    this.log.info("check group user admin group admin: " + result);
    this.config.pollInterval = this.config.pollInterval || 5000;

    // read current existing objects (прочитать текущие существующие объекты)
    this.getForeignObjects(this.namespace + ".*", "state", (err, _states) => {
      states = _states;
      this.getForeignStates(this.namespace + ".*", (err, values) => {
        // subscribe on changes
        this.subscribeStates("*");
        this.subscribeObjects("*");

        // Mark all sensors as if they received something
        for (const id in states) {
          if (!states.hasOwnProperty(id)) continue;
          //if (!states[id].native.link.match(/^https?:\/\//)) {
          //	states[id].native.link = states[id].native.link.replace(/\\/g, '/');
          //}

          // @ts-ignore
          states[id].value = values[id] || { val: null };
          states[id].processed = true;
          this.initPoll(states[id]);
        }

        // trigger all parsers first time
        for (const timer in timers) {
          if (timers.hasOwnProperty(timer)) {
            this.poll(timers[timer].interval);
          }
        }
      });
    });
  }

  /**
   * Is called when adapter shuts down - callback has to be called under any circumstances!
   * @param {() => void} callback
   */
  onUnload(callback) {
    try {
      // Here you must clear all timeouts or intervals that may still be active
      // clearTimeout(timeout1);
      // clearTimeout(timeout2);
      // ...
      // clearInterval(interval1);

      callback();
    } catch (e) {
      callback();
    }
  }

  // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
  // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
  // /**
  //  * Is called if a subscribed object changes
  //  * @param {string} id
  //  * @param {ioBroker.Object | null | undefined} obj
  //  */
  // onObjectChange(id, obj) {
  // 	if (obj) {
  // 		// The object was changed
  // 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
  // 	} else {
  // 		// The object was deleted
  // 		this.log.info(`object ${id} deleted`);
  // 	}
  // }

  /**
   * Is called if a subscribed state changes
   * @param {string} id
   * @param {ioBroker.State | null | undefined} state
   */
  onStateChange(id, state) {
    if (state) {
      // The state was changed
      this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
    } else {
      // The state was deleted
      this.log.info(`state ${id} deleted`);
    }
  }

  // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
  // /**
  //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
  //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
  //  * @param {ioBroker.Message} obj
  //  */
  // onMessage(obj) {
  // 	if (typeof obj === "object" && obj.message) {
  // 		if (obj.command === "send") {
  // 			// e.g. send email or pushover or whatever
  // 			this.log.info("send command");

  // 			// Send response in callback if required
  // 			if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
  // 		}
  // 	}
  // }

  initPoll(obj) {
    if (!obj.native.interval) obj.native.interval = this.config.pollInterval;

    if (!obj.native.regex) obj.native.regex = ".+";

    if (obj.native.regex[0] === "/") {
      obj.native.regex = obj.native.regex.substring(
        1,
        obj.native.regex.length - 1
      );
    }
    obj.native.substituteOld =
      obj.native.substituteOld === "true" || obj.native.substituteOld === true;

    if (
      (obj.native.substitute !== "" || obj.common.type === "string") &&
      obj.native.substitute !== undefined &&
      obj.native.substitute !== null
    ) {
      if (obj.native.substitute === "null") obj.native.substitute = null;

      if (obj.common.type === "number") {
        obj.native.substitute = parseFloat(obj.native.substitute) || 0;
      } else if (obj.common.type === "boolean") {
        if (obj.native.substitute === "true") obj.native.substitute = true;
        if (obj.native.substitute === "false") obj.native.substitute = false;
        obj.native.substitute = !!obj.native.substitute;
      }
    } else {
      obj.native.substitute = undefined;
    }

    obj.native.offset = parseFloat(obj.native.offset) || 0;
    obj.native.factor = parseFloat(obj.native.factor) || 1;
    obj.native.item = parseFloat(obj.native.item) || 0;

    if (!timers[obj.native.interval]) {
      timers[obj.native.interval] = {
        interval: obj.native.interval,
        count: 1,
        timer: setInterval(this.poll, obj.native.interval, obj.native.interval),
      };
    } else {
      timers[obj.native.interval].count++;
    }
  }

  deletePoll(obj) {
    timers[obj.native.interval].count--;
    if (!timers[obj.native.interval].count) {
      clearInterval(timers[obj.native.interval]);
      delete timers[obj.native.interval];
    }
  }
  poll(interval, callback) {
    let id;
    // first mark all entries as not processed and collect the states for current interval tht are not already planned for processing
    const curStates = [];
    const curLinks = [];
    let fullLink = "";
    if (this.config == undefined) return; // check if the adapter is already stopped (otherwise we will get a error on the next line during test:integration)
    fullLink += this.config.scgiServer + "/?";
    for (id in states) {
      if (!states.hasOwnProperty(id)) continue;
      if (states[id].native.interval === interval && states[id].processed) {
        states[id].processed = false;
        curStates.push(id);
        if (curLinks.indexOf(states[id].native.link) === -1) {
          curLinks.push(states[id].native.link);
        }
      }
    }
    for (let j = 0; j < curLinks.length; j++) {
      if (curLinks[j] != "" && curLinks[j] != undefined) {
        this.log.debug("Add Allocation: " + curLinks[j] + " to read list");
        fullLink += curLinks[j] + "&";
      }
    }
    // remove tailing "&"
    fullLink = fullLink.substring(0, fullLink.length - 1);
    this.log.debug(
      "States for current Interval (" +
        interval +
        "): " +
        JSON.stringify(curStates)
    );
    this.log.debug("Request data with URL: " + fullLink);
    request(fullLink, (error, response, body) => {
      parseCybroResult(body, this);
    });
  }
}

if (require.main !== module) {
  // Export the constructor in compact mode
  /**
   * @param {Partial<utils.AdapterOptions>} [options={}]
   */
  module.exports = (options) => new Cybro(options);
} else {
  // otherwise start the instance directly
  new Cybro();
}

function replaceAll(string, token, newtoken) {
  if (token != newtoken) {
    while (string.indexOf(token) > -1) {
      string = string.replace(token, newtoken);
    }
  }
  return string;
}

function parseCybroResult(data, adapter) {
  let xml;
  const expire = adapter.config.pollInterval / 100; // it's 10x the poll interval
  adapter.log.debug("data reply was: " + data);
  if (data == "" || data == undefined) return;
  adapter.setForeignState(adapter.namespace + ".info.connected", {
    val: true,
    ack: true,
    expire: expire,
  });
  parseString(
    data,
    {
      explicitArray: false, // keine expliziten Arrays
      ignoreAttrs: true, // keine Attribute
    },
    function (err, result) {
      let newValues = {};
      //log("result: " + require('util').inspect(result, false, null));
      //log("XML Objekt: " + result);
      xml = JSON.stringify(result);
      //log("XML Objekt: " + xml);
      xml = JSON.parse(xml);
      xml = JSON.stringify(xml.data.var);
      //log("parse 1: " + require('util').inspect(xml, false, null));
      //xml=replaceAll(xml,'[','');
      //xml=replaceAll(xml,']','');
      xml = JSON.parse(xml);
      //log("parse 2: " + require('util').inspect(xml, false, null));
      if (Array.isArray(xml)) {
        for (let i = 0, len = xml.length; i < len; i++) {
          const var_name = replaceAll(JSON.stringify(xml[i].name), '"', "");
          const var_value = replaceAll(JSON.stringify(xml[i].value), '"', "");
          const var_description = replaceAll(
            JSON.stringify(xml[i].description),
            '"',
            ""
          );
          //adapter.log.debug(var_name + var_description + var_value);
          setValue(var_name, var_value, adapter, states);
        }
      } else {
        const var_name = replaceAll(JSON.stringify(xml.name), '"', "");
        const var_value = replaceAll(JSON.stringify(xml.value), '"', "");
        const var_description = replaceAll(
          JSON.stringify(xml.description),
          '"',
          ""
        );
        //adapter.log.debug(var_name + var_description + var_value);
        setValue(var_name, var_value, adapter, states);
      }
    }
  );
}

function setValue(varName, value, adapter, states) {
  let id;
  let newVal;
  for (id in states) {
    if (!states.hasOwnProperty(id)) continue;
    if (states[id].native.link === varName) {
      states[id].processed = true;

      if (states[id].common.type === "boolean") {
        newVal = value === 1 ? true : false; // prepare a boolean value
      } else if (states[id].common.type === "string") {
        newVal = value; // pass through a string tag directly
      } else {
        newVal = value.length > 1 ? value[1] : value[0];

        if (states[id].common.type === "number") {
          const comma = states[id].native.comma;
          if (!comma) newVal = newVal.replace(/,/g, "");
          if (comma) {
            // 1.000.000 => 1000000
            newVal = newVal.replace(/\./g, "");
            // 5,67 => 5.67
            newVal = newVal.replace(",", ".");
          }
          // 1 000 000 => 1000000
          newVal = newVal.replace(/\s/g, "");

          newVal = parseFloat(newVal);
          newVal *= states[id].native.factor;
          newVal += states[id].native.offset;
        }
      }
      if (
        states[id].value.q ||
        newVal !== states[id].value.val ||
        !states[id].value.ack
      ) {
        adapter.log.debug(
          "setValue for " +
            states[id]._id +
            ", old=" +
            states[id].value.val +
            ", new=" +
            newVal
        );
        states[id].value.ack = true;
        states[id].value.val = newVal;
        states[id].value.q = 0;
        adapter.setForeignState(id, {
          val: states[id].value.val,
          q: states[id].value.q,
          ack: states[id].value.ack,
        });
      }
    }
  }
}
