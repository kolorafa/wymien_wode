const { connect } = require('mqtt');

let MQTT_URL = process.env['MQTT_URL'] || 'mqtt://mqtt:mqtt@mqtt';

var client = connect(MQTT_URL);

let powerCheckerTimer = null;

let setStatus = (status) => {
  console.log(new Date(), "Status:", status);
  client.publish('kolorafa/woda_psa/status', status);
  return Promise.resolve();
}

let debuglog = (...debug) => {
  client.publish('kolorafa/woda_psa/debug', JSON.stringify(debug));
}

let actions = {
  wypompuj_wode() {
    return new Promise((res, rej) => {
      client.publish('sonoff_pompa/cmnd/POWER', "1", (err) => {
        if (err) console.error(err);
        setStatus('wypompuj_wode')


        let refreshPowerStatus = () => {
          client.publish('sonoff_pompa/cmnd/Status', "8");
        }

        if (powerCheckerTimer !== null) {
          clearInterval(powerCheckerTimer);
        }

        powerCheckerTimer = setInterval(refreshPowerStatus, 2000);

        refreshPowerStatus();

        return res();
      });
    });
  },
  pompa_stop() {
    return new Promise((res, rej) => {
      client.publish('sonoff_pompa/cmnd/POWER', "0", (err) => {
        if (err) console.error(err);
        setStatus('pompa_stop');

        if (powerCheckerTimer !== null) {
          clearInterval(powerCheckerTimer);
        }
        return res();
      });
    });
  },
  nalej_wode() {
    return new Promise((res, rej) => {
      client.publish('sonoffplug/cmnd/Backlog', "POWER 1; DELAY 150; POWER 0", (err) => {
        setStatus('nalej_wode')
        if (err) console.error(err);
        res(true);
      });

    });
  }
}

client.on('connect', function () {
  setStatus('connected')
  client.subscribe('sonoff_pompa/stat/STATUS8', function (err) {
    if (err) {
      return console.error("got subscribe error O-o", err);
    }

  });
  client.subscribe('kolorafa/woda_psa/wymien', function (err) {
    if (err) {
      return console.error("got subscribe error O-o", err);
    }

  });

})



let parseCurrent = (string) => {
  let json = JSON.parse(string);
  return json.StatusSNS.ENERGY.Power;
}

let getTimestamp = () => Math.floor(Date.now() / 1000);

let lowCurrentStartTime = null;


let doLogicOnCurrent = async (current) => {
  if (current > 2 && current < 6) {
    if (lowCurrentStartTime === null) {
      lowCurrentStartTime = getTimestamp();
    }

    if (getTimestamp() - lowCurrentStartTime > 20) {
      lowCurrentStartTime = getTimestamp() + 1000;
      await actions.pompa_stop();
      await actions.nalej_wode();
    };


  } else {
    lowCurrentStartTime = null;
  }

  debuglog("Moc:", current);
}

client.on('message', function (topic, message) {
  // message is Buffer
  switch (topic) {
    case "sonoff_pompa/stat/STATUS8":
      Promise.resolve(message.toString())
        .then(parseCurrent)
        .then(doLogicOnCurrent)
        .catch(err => {
          console.error("Should not happen", error);
        });
      break;
    case "kolorafa/woda_psa/wymien":
      actions.wypompuj_wode();
      break;
    default:
      console.warn("Unknown topic", topic, message.toString())
  }
  //client.end()
})



//catches ctrl+c event
process.on('SIGINT', async () => {
  console.log("CTRL+C")
  await actions.pompa_stop();
  process.exit(1);
});