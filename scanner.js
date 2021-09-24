class SerialConnector {
	constructor() {
		this.ports = [];
	}
	
	open(port, callback) {
		/*var serialport = require('serialport');
		var sp = new serialport.SerialPort(port, {
			baudRate: 115200, flowControl: true,
			parser: serialport.parsers.readline('\r')
		});
		this.sp = sp;
		sp.on('error', error => {});
		sp.on('open', error => {
			sp.removeAllListeners('open');
			if(callback) {
				callback(error, sp);
			}
		});*/
	}
	
	load(callback) {
		var sp = this.sp;
		if(sp && sp.isOpen()) {
			sp.on('data', data => {
				if(callback) {
					callback(null, data);
				}
			});
		} else {
			if(callback) {
				callback('error');
			}
		}
	}
	
	unload() {
		if(this.sp) {
			this.sp.removeAllListeners('data');
		}
	}
	
	connect(callback) {
		if(this.sp) {
			this.connected = false;
			this.received = true;
			var sp = this.sp;
			sp.on('data', data => {
				if(data.length == 53) {
					if(this.connected == false) {
						this.connected = true;
						if(callback) {
							callback('connected', data);
						}
					}
					this.received = true;
					if(callback) {
						callback(null, data);
					}
				}
			});
			sp.on('disconnect', () => {
				this.close();
				if(callback) {
					callback('disconnected');
				}
			});
			this.timer = setInterval(() => {
				if(this.connected) {
					if(this.received == false) {
						this.connected = false;
						if(callback) {
							callback('lost');
						}
					}
					this.received = false;
				}
			}, 500);
		}
	}
	
	close() {
		this.connected = false;
		if(this.timer) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
		this.clearReconnectTimer();
		if(this.sp) {
			this.removePort(this.sp.path);
			this.sp.removeAllListeners();
			if(this.sp.isOpen()) {
				this.sp.close();
			}
			this.sp = undefined;
		}
	}
	
	send(data) {
		if(this.sp && this.sp.isOpen()) {
			this.sp.write(data);
		}
	}
	
	removePort(port) {
		var index = this.ports.indexOf(port);
		if(index >= 0) {
			this.ports.splice(index, 1);
		}
	}
	
	clearReconnectTimer() {
		if(this.reconnectTimer) {
			clearInterval(this.reconnectTimer);
			this.reconnectTimer = undefined;
		}
	}
	
	closeConnectors() {
		var connectors = this.connectors;
		if(connectors) {
			var connector;
			for(var key in connectors) {
				connector = connectors[key];
				if(connector) {
					connector.close();
				}
			}
		}
		this.connectors = {};
	}
	
	validate(config, data, callback) {
		if(callback) {
			var info = data.split(',');
			if(info && info.length >= 5) {
				var property = this.validateInfo(info, config);
				if(property) {
					callback(true, property);
				} else {
					callback(false);
				}
			}
		}
	}
	
	validateInfo(info, config) {
		if((config.deviceNameChangeable || info[1] == config.deviceName) && info[2] == config.id.substring(2, 4) && info[4].length >= 12) {
			var fw = parseInt(info[3], 16);
			if(typeof fw != 'number') fw = 1;
			var id = config.id.substring(0, 4) + info[3];
			var address = info[4].substring(0, 12);
			return {
				id: id,
				fw: fw,
				address: address
			};
		} else {
			return null;
		}
	}
	
	create() {
		return new SerialConnector();
	}
}

class SerialScanner {
	constructor() {
	}
	
	__requestSerialPortBySerial(doneCallback, errCallback) {
		if('serial' in navigator) {
			navigator.serial.getPorts().then(ports => {
				if(ports && ports.length > 0) {
					doneCallback(ports);
				} else {
					errCallback();
				}
			}).catch(err => {
				console.error(err);
				errCallback();
			});
		} else {
			errCallback();
		}
	}
	
	__requestSerialPortByUsb(doneCallback, errCallback) {
		console.log('hehe');
		if('usb' in navigator) {
			navigator.usb.getDevices().then(devices => {
				console.log(devices);
				if(devices && devices.length > 0) {
					doneCallback(devices);
				} else {
					errCallback();
				}
			}).catch(err => {
				console.error(err);
				errCallback();
			});
		} else {
			errCallback();
		}
	}
	
	__requestSerialPort(callback) {
		this.__requestSerialPortBySerial(ports => {
			callback(ports);
		}, () => {
			this.__requestSerialPortByUsb(ports => {
				callback(ports);
			}, () => {
			});
		});
	}
	
	startScan(configs, callback) {
		this.scanning = true;
		this.found = false;
		this.connectors = {};
		this.scanCount = 0;
		this.closeConnectors();
		this.clearTimer();
		this.scan(configs, callback);
		this.timer = setInterval(() => {
			this.scan(configs, callback);
		}, 1000);
	}
	
	stopScan() {
		this.scanning = false;
		this.clearTimer();
		this.closeConnectors();
	}
	
	scan(configs, callback) {
		if(!this.scanning) return;
		this.__requestSerialPort(devices => {
			let allVendors = false;
			if(this.scanCount < 5) {
				this.scanCount ++;
			} else {
				if(devices.some(device => {
					return device.vendorId == 0x10C4;
				}) == false) {
					allVendors = true;
				}
			}
			
			if(!this.scanning) return;
			devices.forEach(device => {
				if(allVendors || device.vendorId == 0x10C4) {
					console.log(device);
/*					var comName = device.comName;
					var connector = this.connectors[comName];
					if(connector == undefined) {
						connector = require('../connector/serial').create();
						connector.open(comName, (error, sp) => {
							if(error) {
								if(callback) {
									callback(error);
								}
							} else {
								this.connectors[comName] = connector;
								sp.on('data', data => {
									if(data.slice(0, 2) == 'FF') {
										this.validate(connector, configs, data, (result, config, property) => {
											if(result) {
												sp.removeAllListeners('data');
												config.vendor = device.manufacturer;
												this.connectors[comName] = undefined;
												this.found = true;
												if(callback) {
													property.port = comName;
													property.dongle = {};
													property.dongle.canReset = (data.slice(2, 4) == '01');
													callback(null, connector, config, property);
												}
											}
										});
									} else {
										connector.send('FF\r');
									}
								});
							}
						});
					}*/
				}
			});
		});
		if(this.found) {
			this.stopScan();
		}
	}
	
	clearTimer() {
		if(this.timer) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}
	
	closeConnectors() {
		const connectors = this.connectors;
		if(connectors) {
			let connector;
			for(const key in connectors) {
				connector = connectors[key];
				if(connector) {
					connector.close();
				}
			}
		}
		this.connectors = {};
	}
	
	validate(connector, configs, data, callback) {
		if(callback) {
			const info = data.split(',');
			if(info && info.length >= 5) {
				let config, property;
				for(let i = 0, len = configs.length; i < len; ++i) {
					config = configs[i];
					property = connector.validateInfo(info, config);
					if(property) {
						callback(true, config, property);
						return;
					}
				}
				callback(false);
			}
		}
	}
}

class Scanner {
	constructor() {
		this.serialScanner = new SerialScanner();
	}
	
	startScan(router, configs, callback) {
		console.info('scanning...');
		
		this.done = false;
		this.serialScanner.startScan(configs, (error, connector, config, property) => {
			/*if(error) {
				console.error(error);
			} else {
				var controller = require('../../../modules/' + config.module + '/controller').create();
				var route = router.found(controller, config, property);
				controller.load(connector, route, () => {
					router.connect(connector, route);
				});
				if(this.done == false) {
					this.done = true;
					if(callback) {
						callback('done');
					}
				}
			}*/
		});
	}
	
	stopScan() {
		this.serialScanner.stopScan();
		console.info('scanning canceled');
	}
}
