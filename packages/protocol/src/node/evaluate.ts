import * as vm from "vm";
import { NewEvalMessage, TypedValue, EvalFailedMessage, EvalDoneMessage, ServerMessage } from "../proto";
import { SendableConnection } from "../common/connection";

declare var __non_webpack_require__: typeof require;
export const evaluate = async (connection: SendableConnection, message: NewEvalMessage): Promise<void> => {
	const argStr: string[] = [];
	message.getArgsList().forEach((value) => {
		argStr.push(value);
	});
	const sendResp = (resp: any): void => {
		const evalDone = new EvalDoneMessage();
		evalDone.setId(message.getId());
		const tof = typeof resp;
		if (tof !== "undefined") {
			const tv = new TypedValue();
			let t: TypedValue.Type;
			switch (tof) {
				case "string":
					t = TypedValue.Type.STRING;
					break;
				case "boolean":
					t = TypedValue.Type.BOOLEAN;
					break;
				case "object":
					t = TypedValue.Type.OBJECT;
					break;
				case "number":
					t = TypedValue.Type.NUMBER;
					break;
				default:
					return sendErr(EvalFailedMessage.Reason.EXCEPTION, `unsupported response type ${tof}`);
			}
			tv.setValue(tof === "string" ? resp : JSON.stringify(resp));
			tv.setType(t);
			evalDone.setResponse(tv);
		}

		const serverMsg = new ServerMessage();
		serverMsg.setEvalDone(evalDone);
		connection.send(serverMsg.serializeBinary());
	};
	const sendErr = (reason: EvalFailedMessage.Reason, msg: string): void => {
		const evalFailed = new EvalFailedMessage();
		evalFailed.setId(message.getId());
		evalFailed.setReason(reason);
		evalFailed.setMessage(msg);

		const serverMsg = new ServerMessage();
		serverMsg.setEvalFailed(evalFailed);
		connection.send(serverMsg.serializeBinary());
	};
	try {
		const value = vm.runInNewContext(`(${message.getFunction()})(${argStr.join(",")})`, {
			Buffer,
			require: typeof __non_webpack_require__ !== "undefined" ? __non_webpack_require__ : require,
			_require: typeof __non_webpack_require__ !== "undefined" ? __non_webpack_require__ : require,
			tslib_1: require("tslib"), // TODO: is there a better way to do this?
			setTimeout,
		}, {
			timeout: message.getTimeout() || 30000,
		});
		sendResp(await value);
	} catch (ex) {
		sendErr(EvalFailedMessage.Reason.EXCEPTION, ex.toString());
	}
};