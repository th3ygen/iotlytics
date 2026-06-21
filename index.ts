process.env.NTBA_FIX_350 = "true";
import "dotenv/config";

import mqtt from "mqtt";
import schedule from "node-schedule";

import { devices, updateDevice } from "./services/device";
import { sendAlert, sendAwakeStatus, sendDevStatus, sendHeartbeatReport } from "./services/telegram";
import { recordHeartbeat, getReport, resetHeartbeats } from "./services/heartbeat";

const mqttBrokerUrl = process.env.MQTT_BROKER_URL || "mqtt://localhost:8883";
const mqttUsername = process.env.MQTT_USER;
const mqttPassword = process.env.MQTT_PWD;

console.log("Starting server...");
console.log("Host:", mqttBrokerUrl, mqttUsername, mqttPassword);

const mqttClient = mqtt.connect(mqttBrokerUrl, {
	username: mqttUsername,
	password: mqttPassword,
	rejectUnauthorized: false,
});

function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

mqttClient.on("connect", () => {
	console.log("Connected to MQTT broker");
	mqttClient.subscribe("gajahsafe/alert/#", (err) => {
		if (err) {
			console.error(
				new Date(Date.now()).toLocaleString(),
				"Error subscribing to MQTT topic:",
				err
			);
		} else {
			console.log(
				new Date(Date.now()).toLocaleString(),
				"Subscribed to gajahsafe/alert/#"
			);
		}
	});
	mqttClient.subscribe("gajahsafe/awake/#", (err) => {
		if (err) {
			console.error(
				new Date(Date.now()).toLocaleString(),
				"Error subscribing to MQTT topic:",
				err
			);
		} else {
			console.log(
				new Date(Date.now()).toLocaleString(),
				"Subscribed to gajahsafe/awake/#"
			);
		}
	});
	mqttClient.subscribe("gajahsafe/status/#", (err) => {
		if (err) {
			console.error("Error subscribing to MQTT topic:", err);
		} else {
			console.log("Subscribed to gajahsafe/status/#");
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
				if (attempt < 30) {
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
				await delay(3000);
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

		if (path[0] !== "gajahsafe" || !actions.includes(path[1])) {
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

// Schedule 24h heartbeat report at 03:00
schedule.scheduleJob(
	{
		hour: 3,
		minute: 0,
		tz: "Asia/Kuala_Lumpur",
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

// Schedule sendDevStatus every 6 PM and 12 AM
schedule.scheduleJob(
	{
		hour: 18,
		minute: 0,
		tz: "Asia/Kuala_Lumpur",
	},
	job
);
schedule.scheduleJob(
	{
		hour: 12,
		minute: 0,
		tz: "Asia/Kuala_Lumpur",
	},
	job
);

console.log(
	new Date(Date.now()).toLocaleString(),
	"sServer started. Listening for MQTT messages..."
);
