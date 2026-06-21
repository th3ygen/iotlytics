process.env.NTBA_FIX_350 = "true";
import "dotenv/config";

import mqtt from "mqtt";
import schedule from "node-schedule";

import { devices, updateDevice } from "./services/device";
import { sendAlert, sendAwakeStatus, sendDevStatus, sendHeartbeatReport } from "./services/telegram";
import { recordHeartbeat, getReport, resetHeartbeats } from "./services/heartbeat";
import {
	TOPIC_PREFIX,
	MQTT_BROKER_URL,
	MQTT_USERNAME,
	MQTT_PASSWORD,
	MQTT_REJECT_UNAUTHORIZED,
	MAX_RETRY_ATTEMPTS,
	RETRY_DELAY_MS,
	HEARTBEAT_REPORT_HOUR,
	DEV_STATUS_HOURS,
	TIMEZONE,
} from "./services/config";

console.log("Starting server...");
console.log("Host:", MQTT_BROKER_URL, MQTT_USERNAME);

const mqttClient = mqtt.connect(MQTT_BROKER_URL, {
	username: MQTT_USERNAME,
	password: MQTT_PASSWORD,
	rejectUnauthorized: MQTT_REJECT_UNAUTHORIZED,
});

function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

mqttClient.on("connect", () => {
	console.log("Connected to MQTT broker");
	mqttClient.subscribe(`${TOPIC_PREFIX}/alert/#`, (err) => {
		if (err) {
			console.error(
				new Date(Date.now()).toLocaleString(),
				"Error subscribing to MQTT topic:",
				err
			);
		} else {
			console.log(
				new Date(Date.now()).toLocaleString(),
				`Subscribed to ${TOPIC_PREFIX}/alert/#`
			);
		}
	});
	mqttClient.subscribe(`${TOPIC_PREFIX}/awake/#`, (err) => {
		if (err) {
			console.error(
				new Date(Date.now()).toLocaleString(),
				"Error subscribing to MQTT topic:",
				err
			);
		} else {
			console.log(
				new Date(Date.now()).toLocaleString(),
				`Subscribed to ${TOPIC_PREFIX}/awake/#`
			);
		}
	});
	mqttClient.subscribe(`${TOPIC_PREFIX}/status/#`, (err) => {
		if (err) {
			console.error("Error subscribing to MQTT topic:", err);
		} else {
			console.log(`Subscribed to ${TOPIC_PREFIX}/status/#`);
		}
	});
});

const actions = ["alert", "status", "awake"];
type Action = (typeof actions)[number];
const routes: Record<Action, (id: string, message: Buffer) => void> = {
	alert: async (id, message) => {
		try {
			const device = devices[id];

			if (!device) throw new Error("Device does not exists");

			const { image } = JSON.parse(message.toString());

			await sendAlert(device, image);

			console.log(
				new Date(Date.now()).toLocaleString(),
				"Alert sent to Telegram"
			);
		} catch (e) {
			console.error(
				new Date(Date.now()).toLocaleString(),
				"Error sending alert to Telegram:",
				e
			);
		}
	},
	status: async (id) => {
		try {
			const device = devices[id];

			if (!device) throw new Error("Device does not exists");

			device.status = "online";

			updateDevice(id, device);
			recordHeartbeat(id);

			console.log(
				new Date(Date.now()).toLocaleString(),
				`Device status updated for ${id}`
			);
		} catch (e) {
			console.error(
				new Date(Date.now()).toLocaleString(),
				"Error sending status to Telegram:",
				e
			);
		}
	},
	awake: async (id) => {
		let attempt = 0;
		const trySend = async () => {
			try {
				if (attempt < MAX_RETRY_ATTEMPTS) {
					const device = devices[id];

					if (!device) throw new Error("Device does not exists");

					device.status = "online";

					updateDevice(id, device);

					await sendAwakeStatus(device);

					console.log(
						new Date(Date.now()).toLocaleString(),
						"Status sent to Telegram"
					);
				}
				return;
			} catch (e) {
				console.error(
					new Date(Date.now()).toLocaleString(),
					"Error sending status to Telegram:",
					e
				);
				await delay(RETRY_DELAY_MS);
				attempt++;
				return trySend();
			}
		};
		return trySend();
	},
};

mqttClient.on("message", async (topic, message) => {
	const path = topic.split("/");
	try {
		if (path.length < 3) {
			throw new Error("Invalid topic path");
		}

		if (path[0] !== TOPIC_PREFIX || !actions.includes(path[1])) {
			throw new Error("Invalid topic path");
		}

		console.log(
			new Date(Date.now()).toLocaleString(),
			path[1] as Action,
			path[2],
			message.toString().slice(0, 7)
		);

		routes[path[1] as Action](path[2], message);
	} catch (err) {
		console.error(
			new Date(Date.now()).toLocaleString(),
			path,
			"Error parsing MQTT message:",
			err
		);
	}
});

mqttClient.on("error", (err) => {
	console.error(new Date(Date.now()).toLocaleString(), "MQTT error:", err);
});

const job = async () => {
	let attempt = 0;
	console.log(
		new Date(Date.now()).toLocaleString(),
		"Running scheduled sendDevStatus..."
	);

	const trySend = async () => {
		try {
			if (attempt < 30) {
				await sendDevStatus(devices);
			}

			// reset status
			for (let id in devices) {
				updateDevice(id, {
					...devices[id],
					status: "pending",
				});
			}

			console.log(
				new Date(Date.now()).toLocaleString(),
				"Scheduled sendDevStatus completed."
			);
			return;
		} catch (error) {
			await delay(3000);

			attempt++;
			trySend();
		}
	};

	await trySend();

	return;
};

// Schedule 24h heartbeat report
schedule.scheduleJob(
	{
		hour: HEARTBEAT_REPORT_HOUR,
		minute: 0,
		tz: TIMEZONE,
	},
	async () => {
		console.log(
			new Date(Date.now()).toLocaleString(),
			"Running midnight heartbeat report..."
		);
		try {
			const reports = Object.keys(devices).map((key) => getReport(key));
			await sendHeartbeatReport(reports, devices);
			resetHeartbeats();
			console.log(
				new Date(Date.now()).toLocaleString(),
				"Heartbeat report sent and store reset."
			);
		} catch (e) {
			console.error(
				new Date(Date.now()).toLocaleString(),
				"Error sending heartbeat report:",
				e
			);
		}
	}
);

// Schedule sendDevStatus at each configured hour
for (const hour of DEV_STATUS_HOURS) {
	schedule.scheduleJob(
		{
			hour,
			minute: 0,
			tz: TIMEZONE,
		},
		job
	);
}

console.log(
	new Date(Date.now()).toLocaleString(),
	"sServer started. Listening for MQTT messages..."
);
