/**
 * @Author: Daniel Gangl
 * @Date:   2021-07-17 13:26:54
 * @Last Modified by:   Daniel Gangl
 * @Last Modified time: 2021-07-23 17:30:04
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
    this.on("objectChange", this.onObjectChange.bind(this));
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
    this.config.pollInterval = this.config.pollInterval || 5000; // init with a default interval, if it is zero
    // line below is used temporaray for testing purposes (not used in production)
    this.config.scgiServer = "http://www.solar-cybro.com/scgi";

    this.log.info("configured scgi server url: " + this.config.scgiServer);
    this.log.info(
      "configured default poll interval: " + this.config.pollInterval + " msec"
    );

    /*
		For every state in the system there has to be also an object of type state
		Here a simple template for a boolean variable named "testVariable"
		Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
		*/
    //await this.setObjectNotExistsAsync("testVariable", {
    //  type: "state",
    //  common: {
    //    name: "testVariable",
    //    type: "boolean",
    //    role: "indicator",
    //    read: true,
    //    write: true,
    //  },
    //  native: {},
    //});

    // In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
    //this.subscribeStates("testVariable");
    // You can also add a subscription for multiple states. The following line watches all states starting with "lights."
    // this.subscribeStates("lights.*");
    // Or, if you really must, you can also watch all states. Don't do this if you don't need to. Otherwise this will cause a lot of unnecessary load on the system:
    // this.subscribeStates("*");

    /*
			setState examples
			you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
		*/
    // the variable testVariable is set to true as command (ack=false)
    //await this.setStateAsync("testVariable", true);

    // same thing, but the value is flagged "ack"
    // ack should be always set to true if the value is received from or acknowledged from the target system
    //await this.setStateAsync("testVariable", { val: true, ack: true });

    // same thing, but the state is deleted after 30s (getState will return null afterwards)
    //await this.setStateAsync("testVariable", {
    //  val: true,
    //  ack: true,
    //  expire: 30,
    //});

    // examples for the checkPassword/checkGroup functions
    //let result = await this.checkPasswordAsync("admin", "iobroker");
    //this.log.info("check user admin pw iobroker: " + result);

    //result = await this.checkGroupAsync("admin", "admin");
    //this.log.info("check group user admin group admin: " + result);

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
      for (const id in states) {
        if (!states.hasOwnProperty(id)) continue;
        this.deletePoll(states[id]);
      }
      callback();
    } catch (e) {
      callback();
    }
  }

  /**
   * Is called if a subscribed object changes
   * @param {string} id id of the object
   * @param {ioBroker.Object | null | undefined} obj the object itself
   */
  onObjectChange(id, obj) {
    if (!id) return;
    if (!obj) {
      // The object was deleted
      this.log.info(`object ${id} deleted`);
      if (states[id]) {
        deletePoll(states[id]);
        delete states[id];
      }
    } else {
      // The object was changed
      if (!obj.native.interval) obj.native.interval = this.config.pollInterval;
      obj.native.interval = parseInt(obj.native.interval, 10);
      this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
      if (!states[id]) {
        states[id] = obj;
        this.initPoll(states[id]);
      } else {
        if (states[id].native.interval !== obj.native.interval) {
          this.deletePoll(states[id]);
          states[id] = obj;
          this.initPoll(states[id]);
        } else {
          states[id] = obj;
        }
      }
    }
  }

  /**
   * Is called if a subscribed state changes
   * @param {string} id id of the state object
   * @param {ioBroker.State | null | undefined} state descriptor of the state object
   */
  onStateChange(id, state) {
    if (state) {
      // The state was changed
      //this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
      if (states[id].common.write && state.from != "system." + this.namespace) {
        let writeLink =
          this.config.scgiServer + "/?" + states[id].native.link + "=";
        let wrVal = state.val;
        if (states[id].common.type === "boolean")
          wrVal = wrVal === true ? 1 : 0;
        writeLink += wrVal;
        request(writeLink, (error, response, body) => {
          this.parseCybroResult(body, this);
        });
      }
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
  /**
   * init / add a object to the polling list
   * @param {ioBroker.Object | null | undefined} obj the state object to add to the poll
   */
  initPoll(obj) {
    if (!obj.native.interval) obj.native.interval = this.config.pollInterval;

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

    if (!timers[obj.native.interval]) {
      timers[obj.native.interval] = {
        interval: obj.native.interval,
        count: 1,
        timer: setInterval(
          () => {
            this.poll(obj.native.interval);
          },
          obj.native.interval,
          obj.native.interval
        ),
      };
      this.log.info(
        "create new timer for polling with interval: " +
          obj.native.interval +
          " ms"
      );
    } else {
      timers[obj.native.interval].count++;
    }
  }
  /**
   * removes a object from polling
   * @param {ioBroker.Object | null | undefined} obj the state object
   */
  deletePoll(obj) {
    timers[obj.native.interval].count--;
    if (!timers[obj.native.interval].count) {
      clearInterval(timers[obj.native.interval]);
      delete timers[obj.native.interval];
    }
  }
  /**
   * worker function for the cyclic read of the data from the scgi server
   * @param {number} interval the called interval in ms
   * @returns nothing
   */
  poll(interval) {
    if (this.config == undefined) return; // check if the adapter is already stopped (otherwise we will get a error on access to "this")
    let id;
    // first mark all entries as not processed and collect the states for current interval tht are not already planned for processing
    const curStates = [];
    const curLinks = [];
    let fullLink = "";
    fullLink += this.config.scgiServer + "/?";
    for (id in states) {
      if (!states.hasOwnProperty(id)) continue;
      if (states[id].native.interval === interval && states[id].processed) {
        states[id].processed = false;
        curStates.push(id);
        if (
          curLinks.indexOf(states[id].native.link) === -1 &&
          states[id].common.read
        ) {
          curLinks.push(states[id].native.link);
        }
      }
    }
    for (let j = 0; j < curLinks.length; j++) {
      if (curLinks[j] != "" && curLinks[j] != undefined) {
        fullLink += curLinks[j] + "&";
      }
    }
    // remove tailing "&"
    fullLink = fullLink.substring(0, fullLink.length - 1);
    // if there are no states to read return
    if (curStates.length === 0) return;
    this.log.debug("Request data with URL: " + fullLink);
    request(fullLink, (error, response, body) => {
      this.parseCybroResult(body, this);
    });
  }
  /**
   * parsing received data from scgi server
   * @param {string} data received data from scgi server (a string of a xml "file")
   * @param {Cybro} adapter own adapter instance
   * @returns nothing
   */
  parseCybroResult(data, adapter) {
    let xml;
    const expire = adapter.config.pollInterval / 100; // it's 10x the poll interval
    adapter.log.debug("data reply was: " + data);
    if (data == "" || data == undefined) return;
    adapter.setForeignState(adapter.namespace + ".info.connection", {
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
        xml = JSON.stringify(result);
        xml = JSON.parse(xml);
        xml = JSON.stringify(xml.data.var);
        xml = JSON.parse(xml);
        if (Array.isArray(xml)) {
          for (let i = 0, len = xml.length; i < len; i++) {
            const var_name = replaceAll(JSON.stringify(xml[i].name), '"', "");
            const var_value = replaceAll(JSON.stringify(xml[i].value), '"', "");
            const var_description = replaceAll(
              JSON.stringify(xml[i].description),
              '"',
              ""
            );
            adapter.setNewValue(var_name, var_value, adapter);
          }
        } else {
          const var_name = replaceAll(JSON.stringify(xml.name), '"', "");
          const var_value = replaceAll(JSON.stringify(xml.value), '"', "");
          const var_description = replaceAll(
            JSON.stringify(xml.description),
            '"',
            ""
          );
          adapter.setNewValue(var_name, var_value, adapter);
        }
      }
    );
  }
  /**
   * parse a received value from the scgi server and set it to the state variable
   * @param {string} varName received plc allocation name
   * @param {string} value received value from scgi server
   * @param {Cybro} adapter the adapter instance
   */
  setNewValue(varName, value, adapter) {
    let id;
    let newVal;
    let q = value === "?" ? 0x82 : 0; // i
    for (id in states) {
      if (!states.hasOwnProperty(id)) continue;
      if (states[id].native.link === varName) {
        states[id].processed = true;
        if (!states[id].common.read) continue;
        if (states[id].value.q === undefined) states[id].value.q = 0x0;
        // unknown value received (value = ? from scgi server)
        if (states[id].value.q !== 0x82 && q === 0x82) {
          if (states[id].native.substitute !== undefined) {
            newVal = states[id].native.substitute;
          }
        } else if (states[id].common.type === "boolean") {
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
          states[id].value.q = q;
          adapter.setForeignState(id, {
            val: states[id].value.val,
            q: states[id].value.q,
            ack: states[id].value.ack,
          });
        }
      }
    }
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
/**
 * Replace characters in a string multiple times
 * @param {string} string String containing characters to replace
 * @param {string} token Token to search for
 * @param {string} newtoken New token for replacement
 * @returns string with replaced tokens
 */
function replaceAll(string, token, newtoken) {
  if (token != newtoken) {
    while (string.indexOf(token) > -1) {
      string = string.replace(token, newtoken);
    }
  }
  return string;
}
