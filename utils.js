pm.globals.set('utils', function testUtils() {
    let utils = {};

    // Custom request function
    utils.request = {
        post: async function (url, options) {
            return new Promise((resolve, reject) => {
                pm.sendRequest({
                    url: url,
                    method: 'POST',
                    header: options.headers,
                    body: {
                        mode: 'raw',
                        raw: JSON.stringify(options.data),
                        options: {
                            raw: {
                                language: 'json'
                            }
                        }
                    }
                }, function (err, response) {
                    if (err) {
                        reject(err);
                    } else {
                        // Create a safe wrapper to prevent recursion
                        const responseWrapper = {
                            status: function () { return response.code; },
                            json: function () { 
                                try {
                                    return response.json(); 
                                } catch (e) {
                                    throw new Error(`Failed to parse JSON: ${e.message}`);
                                }
                            }, // Return parsed JSON directly
                            rawResponse: response // Keep original for special cases
                        };
                        resolve(responseWrapper);
                    }
                });
            });
        },

        put: async function (url, options) {
            return new Promise((resolve, reject) => {
                pm.sendRequest({
                    url: url,
                    method: 'PUT',
                    header: options.headers,
                    body: {
                        mode: 'raw',
                        raw: JSON.stringify(options.data),
                        options: {
                            raw: {
                                language: 'json'
                            }
                        }
                    }
                }, function (err, response) {
                    if (err) {
                        reject(err);
                    } else {
                        // Create a safe wrapper to prevent recursion
                        const responseWrapper = {
                            status: function () { return response.code; },
                            json: function () { 
                                try {
                                    return response.json(); 
                                } catch (e) {
                                    throw new Error(`Failed to parse JSON: ${e.message}`);
                                }
                            }, // Return parsed JSON directly
                            rawResponse: response // Keep original for special cases
                        };
                        resolve(responseWrapper);
                    }
                });
            });
        },

        patch: async function (url, options) {
            return new Promise((resolve, reject) => {
                pm.sendRequest({
                    url: url,
                    method: 'PATCH',
                    header: options.headers,
                    body: {
                        mode: 'raw',
                        raw: JSON.stringify(options.data),
                        options: {
                            raw: {
                                language: 'json'
                            }
                        }
                    }
                }, function (err, response) {
                    if (err) {
                        reject(err);
                    } else {
                        // Create a safe wrapper to prevent recursion
                        const responseWrapper = {
                            status: function () { return response.code; },
                            json: function () { 
                                try {
                                    return response.json(); 
                                } catch (e) {
                                    throw new Error(`Failed to parse JSON: ${e.message}`);
                                }
                            }, // Return parsed JSON directly
                            rawResponse: response // Keep original for special cases
                        };
                        resolve(responseWrapper);
                    }
                });
            });
        },

        get: async function (url, options) {
            return new Promise((resolve, reject) => {
                pm.sendRequest({
                    url: url,
                    method: 'GET',
                    header: options?.headers || {}
                }, function (err, response) {
                    if (err) {
                        reject(err);
                    } else {
                        const responseWrapper = {
                            status: function () { return response.code; },
                            json: function () { 
                                try {
                                    return response.json(); 
                                } catch (e) {
                                    throw new Error(`Failed to parse JSON: ${e.message}`);
                                }
                            },
                            rawResponse: response
                        };
                        resolve(responseWrapper);
                    }
                });
            });
        },

        delete: async function (url, options = {}) {
            return new Promise((resolve, reject) => {
                pm.sendRequest({
                    url: url,
                    method: 'DELETE',
                    header: options.headers || {},
                    // DELETE requests can optionally have a body
                    ...(options.data && {
                        body: {
                            mode: 'raw',
                            raw: JSON.stringify(options.data),
                            options: {
                                raw: {
                                    language: 'json'
                                }
                            }
                        }
                    })
                }, function (err, response) {
                    if (err) {
                        reject(err);
                    } else {
                        const responseWrapper = {
                            status: function () { return response.code; },
                            json: function () { 
                                try {
                                    return response.json(); 
                                } catch (e) {
                                    throw new Error(`Failed to parse JSON: ${e.message}`);
                                }
                            },
                            rawResponse: response
                        };
                        resolve(responseWrapper);
                    }
                });
            });
        }

    };

    utils.formatDate = function formatDate(date) {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        const seconds = String(date.getUTCSeconds()).padStart(2, '0');

        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.000`;
    };

    utils.returnLastEvent = async function returnLastEvent(eventName, servicePublicKey) {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayEnd = new Date(today);
            todayEnd.setHours(23, 59, 59, 0);

     

            const payload = {
                pSize: 100,
                pIndex: 0,
                from: this.formatDate(today),
                to: this.formatDate(todayEnd),
                query: {
                    event_name: eventName
                }
            };

            const [enc_request_id, enc_license_key] = await Promise.all([
                this.encryptDataWithEnvKeys(JSON.stringify(this.generateRequestId()), servicePublicKey),
                this.encryptDataWithEnvKeys(pm.environment.get("client_license"), servicePublicKey)
            ]);

            const response = await this.request.post(
                `${pm.environment.get("reports")}/tenant/${pm.environment.get("tenantId")}/community/${pm.environment.get("communityId")}/events`,
                {
                    headers: {
                        "Content-Type": "application/json",
                        publickey: pm.environment.get("my_public_key"),
                        requestid: enc_request_id,
                        licensekey: enc_license_key
                    },
                    data: payload
                }
            );
            const parsedJson = response.json();
            return parsedJson.data[0];

        } catch (error) {
            console.error("Error during requesting last event:", error);
            throw error;
        }
    };
    utils.unlockUser = async function unlockUser(username) {
        const umServicePublicKey = await utils.fetchServicePublicKey(pm.environment.get("user_management"));
        let umpayload = {
            "username": username,
            "reason": {
                "reasonCode": 0,
                "message": "Admin Action"
            },
            "initiatedby": "cadmin"
        }
        const [um_enc_request_id, um_enc_license_key, um_enc_data] = await Promise.all([
            utils.encryptDataWithEnvKeys(JSON.stringify(utils.generateRequestId()), umServicePublicKey),
            utils.encryptDataWithEnvKeys(pm.environment.get("client_license"), umServicePublicKey),
            utils.encryptDataWithEnvKeys(JSON.stringify(umpayload), umServicePublicKey)
        ]);

        utils.setVars({
            um_enc_request_id,
            um_enc_license_key,
            um_enc_data
        });
        const unlockUser = await utils.request.put(
            `${pm.environment.get("user_management")}/tenant/${pm.environment.get("tenantId")}/community/${pm.environment.get("communityId")}/user/unlock`,
            {
                headers: {
                    "publickey": pm.environment.get("my_public_key"),
                    "requestid": um_enc_request_id,
                    "licensekey": um_enc_license_key,
                    "Content-Type": "application/json"
                },
                data: umpayload
                // {data: um_enc_data}
            }
        );
        if (unlockUser.status() !== 200) {
            throw new Error(`Failed to lock user. Status: ${unlockUser.status()}`);
        }
    }

    utils.validateEventTimestamp = function validateEventTimestamp(event, maxDifferenceSeconds = 10) {
        const currentTimeUTC = Math.floor(new Date().getTime() / 1000);
        const eventTimeSeconds = Math.floor(event.event_ts / 1000);
        const timeDifference = Math.abs(currentTimeUTC - eventTimeSeconds);

        pm.expect(timeDifference).to.be.below(maxDifferenceSeconds,
            `Event timestamp differs by ${timeDifference} seconds, which is more than ${maxDifferenceSeconds} seconds from current time. Current UTC: ${currentTimeUTC}, Event time: ${eventTimeSeconds}`);
    };

    utils.generateRequestId = function generateRequestId() {
        return {
            ts: Math.floor(Date.now() / 1000),
            appid: pm.environment.get("appId"),
            uuid: pm.variables.replaceIn('{{$guid}}')
        };
    };

    utils.returnUsersDevices = async function returnUsersDevices(username, servicePublicKey) {
        const tag = pm.environment.get("client_tenant_tag");

        try {
            // Шифруем requestId и licenseKey
            const [enc_request_id, enc_license_key] = await Promise.all([
                utils.encryptDataWithEnvKeys(JSON.stringify(utils.generateRequestId()), servicePublicKey),
                utils.encryptDataWithEnvKeys(pm.environment.get("client_license"), servicePublicKey),
            ]);

            utils.setVars({
                enc_request_id,
                enc_license_key,
            });

            // Выполняем запрос
            const userDevices = await utils.request.get(
                `${pm.environment.get("adminconsole")}/api/r1/community/${pm.environment.get("client_community_name")}/userid/${username}/details?devicelist=true`,
                {
                    headers: {
                        "publickey": pm.environment.get("my_public_key"),
                        "requestid": enc_request_id,
                        "licensekey": enc_license_key,
                        "X-TenantTag": tag,
                        "Content-Type": "application/json"
                    }
                }
            );

            if (userDevices.status() !== 200) {
                return []
            }

            // Расшифровываем ответ
            const encrypted = userDevices.json().data;
            const decrypted = await utils.decryptDataWithEnvKeys(encrypted, servicePublicKey);

            // Можно добавить лог для наглядности
            utils.prettyPrint(decrypted);

            // Возвращаем массив устройств
            return decrypted.devices;

        } catch (error) {
            console.error("❌ Error in returnUsersDevices:", error.message);
            throw error;
        }
    };

    utils.linkDevice = async function linkDevice(username, deviceName) {
        try {
            const tag = pm.environment.get("client_tenant_tag");
            const adminconsole = pm.environment.get("adminconsole");
            const community = pm.environment.get("client_community_name");
            const license = pm.environment.get("client_license");

            // ------------------ 1️⃣ Retrieve servicePublicKey ------------------
            const communityUrl = `${adminconsole}/api/r1/community/${community}`;
            const servicePublicKey = await utils.fetchServicePublicKey(communityUrl, tag);
            pm.collectionVariables.set("servicePublicKey", servicePublicKey);

            // ------------------ 2️⃣ Retrieve user object ------------------
            const user = await utils.fetchSingleUserByUsername(username);
            const fullUserObject = user.data;
            utils.prettyPrint(fullUserObject);

            // ------------------ 3️⃣ Формируем payload для создания кода ------------------
            const payload = {
                userId: fullUserObject.username,
                firstname: fullUserObject.firstname,
                lastname: fullUserObject.lastname,
                emailTo: fullUserObject.email,
                smsTo: fullUserObject.email,
                uid: fullUserObject.uid,
                createdby: "cadmin",
                createdbyemail: "andrii.ziazin@1kosmos.com",
                authModuleId: fullUserObject.moduleId,
                dns: pm.environment.get("dns"),
            };
            utils.prettyPrint(payload);

            // ------------------ 4️⃣ Шифруем и создаем код ------------------
            const [enc_request_id, enc_license_key, enc_data] = await Promise.all([
                utils.encryptDataWithEnvKeys(JSON.stringify(utils.generateRequestId()), servicePublicKey),
                utils.encryptDataWithEnvKeys(license, servicePublicKey),
                utils.encryptDataWithEnvKeys(JSON.stringify(payload), servicePublicKey),
            ]);

            const createCodeResponse = await utils.request.put(
                `${adminconsole}/api/r2/acr/community/${community}/code`,
                {
                    headers: {
                        "publickey": pm.environment.get("my_public_key"),
                        "requestid": enc_request_id,
                        "licensekey": enc_license_key,
                        "X-TenantTag": tag,
                        "Content-Type": "application/json",
                    },
                    data: {
                        data: enc_data,
                    },
                }
            );

            if (createCodeResponse.status() !== 200) {
                throw new Error(`Failed to create access code. Status: ${createCodeResponse.status()}`);
            }

            const accessCode = createCodeResponse.json().code;
            pm.collectionVariables.set("accesscode", accessCode);
            console.log(`✅ Access code created: ${accessCode}`);

            // ------------------ 5️⃣ Выбираем устройство ------------------
            let selectedDeviceName = deviceName;
            if (!selectedDeviceName) {
                const randomIndex = Math.floor(Math.random() * 5) + 1; // 1–5
                selectedDeviceName = `device${randomIndex}`;
            }

            const device = JSON.parse(pm.environment.get(selectedDeviceName));
            if (!device) throw new Error(`Device ${selectedDeviceName} not found in environment`);

            utils.prettyPrint(device);
            pm.collectionVariables.set("currentTestDevice", JSON.stringify(device));

            pm.collectionVariables.set("device_id", device.device_id);
            pm.collectionVariables.set("did", device.did);
            pm.collectionVariables.set("devicePublicKey", device.publicKey);
            pm.collectionVariables.set("devicePrivateKey", device.privateKey);
            pm.collectionVariables.set("device_name", device.device_name);
            pm.collectionVariables.set("os", device.os);
            pm.collectionVariables.set("provider", device.provider);
            pm.collectionVariables.set("pushid", device.pushId);

            // ------------------ 6️⃣ Готовим данные для redeem ------------------
            const eventData = {
                authenticator_id: "com.onekosmos.kernel.blockid",
                authenticator_name: "BlockID",
                authenticator_os: "iOS",
                authenticator_version: "1.10.93.67AC471E",
                device_id: device.device_id,
                device_make: device.device_name,
                device_model: device.device_name,
                device_name: device.device_name,
                license_hash: "485a4592896616e3f422a7ded89a3e381f6ad2943f3302571a53282ef14c6ff7",
                os: "iOS",
                os_version: "17",
                person_ial: "IAL1",
                person_id: device.did,
                person_publickey: device.publicKey,
                user_agent:
                    "Mozilla/5.0 (Linux; Android 9; Mi MIX 2 Build/PKQ1.190118.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/133.0.6943.137 Mobile Safari/537.36",
                user_ial: "",
                user_lat: "0.0",
                user_lon: "0.0",
            };

            const acrRedeemPayload = {
                code: accessCode,
                userPublicKey: device.publicKey,
                password: "",
                userId: username,
            };

            // ------------------ 7️⃣ Шифруем данные для redeem ------------------
            const [enc_request_id2, enc_license_key2, enc_eventData, enc_acr_redeem_payload] = await Promise.all([
                utils.encryptDataWithEnvKeys(JSON.stringify(utils.generateRequestId()), servicePublicKey),
                utils.encryptDataWithEnvKeys(license, servicePublicKey),
                utils.encryptDataWithEnvKeys(JSON.stringify(eventData), servicePublicKey),
                utils.encryptDataWithEnvKeys(JSON.stringify(acrRedeemPayload), servicePublicKey),
            ]);

            // ------------------ 8️⃣ Выполняем redeem ------------------
            const redeemResponse = await utils.request.post(
                `${adminconsole}/api/r1/acr/community/${community}/${accessCode}/redeem`,
                {
                    headers: {
                        "publickey": pm.environment.get("my_public_key"),
                        "requestid": enc_request_id2,
                        "licensekey": enc_license_key2,
                        "X-TenantTag": tag,
                        "Content-Type": "application/json",
                    },
                    data: {
                        data: enc_acr_redeem_payload,
                        eventData: enc_eventData,
                        did: device.did,
                        os: device.os,
                        provider: device.provider,
                        pushid: device.pushId,
                        ial: "IAL1",
                    },
                }
            );

            if (redeemResponse.status() !== 200) {
                throw new Error(`Failed to redeem code. Status: ${redeemResponse.status()}`);
            }

            console.log("✅ Device successfully linked via redeem");
            return {
                username,
                accessCode,
                device: selectedDeviceName,
                status: "linked",
            };
        } catch (error) {
            console.error("❌ utils.linkDevice error:", error.message);
            throw error;
        }
    };

    utils.generateRequestIdAndSaveUUID = function generateRequestIdAndSaveUUID() {
        const requestData = {
            ts: Math.floor(Date.now() / 1000),
            appid: pm.environment.get("appId"),
            uuid: pm.variables.replaceIn('{{$guid}}')
        };

        pm.collectionVariables.set("currentRequestId", requestData.uuid);
        pm.collectionVariables.set("salt", requestData.uuid)
        console.log(`Saved current requestId ${requestData.uuid} as currentRequestId`);
        return requestData;
    };

    utils.fetchCommunityAuthInfo = async function fetchCommunityAuthInfo(dns, communityName) {
        try {
            const payload = {
                "dns": dns,
                "communityName": communityName
            };
            const servicePublicKey = await this.fetchServicePublicKey(pm.environment.get("adminapi"));

            const [enc_request_id, enc_data] = await Promise.all([
                this.encryptDataWithEnvKeys(JSON.stringify(this.generateRequestId()), servicePublicKey),
                this.encryptDataWithEnvKeys(JSON.stringify(payload), servicePublicKey)
            ]);

            this.setVars({
                enc_request_id,
                enc_data
            });

            const url = `${pm.environment.get("adminapi")}/community_auth_info/fetch`;
            const response = await this.request.post(
                url,
                {
                    headers: {
                        "Content-Type": "application/json",
                        publickey: pm.environment.get("my_public_key"),
                        requestid: enc_request_id
                    },
                    data: { data: enc_data }
                }
            );

            const parsedJson = await this.decryptDataWithEnvKeys(response.json().data, servicePublicKey);
            pm.collectionVariables.set("community_auth_info", JSON.stringify(parsedJson));
            return parsedJson;

        } catch (error) {
            console.error("Fetching community auth info failed:", error);
            throw error;
        }
    };

    utils.checkJWTToken = async function checkJWTToken(token, servicePublicKey, username) {
        try {
            const requestId = {
                ts: Math.floor(Date.now() / 1000),
                appid: pm.collectionVariables.get("appId"),
                uuid: pm.variables.replaceIn('{{$guid}}')
            };

            const payload = { token };

            const [enc_request_id, enc_data] = await Promise.all([
                this.encryptDataWithEnvKeys(JSON.stringify(requestId), servicePublicKey),
                this.encryptDataWithEnvKeys(JSON.stringify(payload), servicePublicKey)
            ]);

            const response = await this.request.post(
                `${pm.environment.get("adminapi")}/jwt/verifyToken`,
                {
                    headers: {
                        "Content-Type": "application/json",
                        publickey: pm.environment.get("my_public_key"),
                        requestid: enc_request_id
                    },
                    data: {
                        data: enc_data
                    }
                }
            );

            if (response.status() === 200) {
                const encryptedData = response.json().data;
                const jsonData = await this.decryptDataWithEnvKeys(encryptedData, pm.collectionVariables.get("servicePublicKey"));
                return token;
            } else {
                console.warn(`JWT check failed with status: ${response.status()}. Falling back to loginWithPwdAndOtp.`);
                return await this.loginWithPwdAndOtp(username, servicePublicKey);
            }

        } catch (error) {
            console.error("CheckJWTToken failed:", error);
            throw error;
        }
    };

    utils.checkJWTTokenIdvaapi = async function checkJWTTokenIdvaapi(token, servicePublicKey, username) {
        try {
            if (!token || token === null || token === undefined || token === '') {
                console.log("🔄 No JWT token found, performing login...");
                return await this.loginWithPwdAndOtp(username);
            }

            const requestId = {
                ts: Math.floor(Date.now() / 1000),
                appid: pm.variables.get("appId"),
                uuid: pm.variables.replaceIn('{{$guid}}')
            };

            console.log("Run checkJWTTokenIdvaapi");

            const payload = { token };
            const [enc_request_id, enc_data, enc_jwt] = await Promise.all([
                this.encryptDataWithEnvKeys(JSON.stringify(requestId), servicePublicKey),
                this.encryptDataWithEnvKeys(JSON.stringify(payload), servicePublicKey),
                this.encryptDataWithEnvKeys(token, servicePublicKey)
            ]);

            const response = await this.request.post(
                `${pm.environment.get("idvaapi")}/jwt/verifyToken`,
                {
                    headers: {
                        "Content-Type": "application/json",
                        publickey: pm.environment.get("my_public_key"),
                        requestid: enc_request_id,
                        Authorization: "Bearer " + enc_jwt
                    },
                    data: {
                        data: enc_data
                    }
                }
            );

            if (response.status() === 200) {
                return token;
            } else {
                console.warn(`JWT check failed with status: ${response.status()}. Falling back to loginWithPwdAndOtp.`);
                return await this.loginWithPwdAndOtp(username);
            }
        } catch (error) {
            console.error("CheckJWTToken failed:", error);
            throw error;
        }
    };

    utils.generateOTP = async function generateOTP(username, servicePublicKey, serviceName, validitySeconds = 0, regenerateOTP = true) {
        const previousOtp = pm.collectionVariables.get("decryptedOtp");
        const previousTtl = Number(pm.collectionVariables.get("secondsRemaining")) || 0;

        // if servicePublicKey is not set — get from server
        if (!servicePublicKey) {
            console.log("No servicePublicKey provided, fetching from server...");
            const tag = pm.environment.get("client_tenant_tag");
            const headers = {
                "Content-Type": "application/json",
                "X-TenantTag": tag
            };

            const response = await this.request.get(
                `${pm.environment.get("adminconsole")}/api/r1/community/${pm.environment.get("client_community_name")}/publickeys`,
                { headers }
            );

            if (response.status() !== 200) {
                console.error(`Failed to fetch service public key: ${response.status()}`);
            }

            servicePublicKey = response.json().publicKey;
            console.log("Fetched servicePublicKey from server");
        }

        //  payload
        const payload = {
            userId: username,
            isCycleTimeRequired: true,
            communityId: pm.environment.get("communityId"),
            tenantId: pm.environment.get("tenantId"),
            trace: true


        };


        // if argument value validitySeconds — add it in payload
        if (validitySeconds !== 0) {
            payload.validitySeconds = validitySeconds;
        }

        // if argument serviceName — add it in payload
        if (serviceName) {
            payload.serviceName = serviceName;
        }

        const [enc_request_id, enc_license_key] = await Promise.all([
            this.encryptDataWithEnvKeys(JSON.stringify(this.generateRequestId()), servicePublicKey),
            this.encryptDataWithEnvKeys(pm.environment.get("client_license"), servicePublicKey)
        ]);



        const generateAndDecryptOtp = async () => {
            const response = await this.request.post(
                `${pm.environment.get("adminconsole")}/api/r2/otp/generate`,
                {
                    headers: {
                        "Content-Type": "application/json",
                        publickey: pm.environment.get("my_public_key"),
                        requestid: enc_request_id,
                        licensekey: enc_license_key
                    },
                    data: payload
                }
            );
            return await this.decryptDataWithEnvKeys(response.json().data, servicePublicKey);
        };


        // if regenerateOTP is not set
        let otpData = await generateAndDecryptOtp();
        console.log(payload);
        console.log(otpData);



        if (regenerateOTP) {

            if (otpData.code === previousOtp && previousTtl > 0) {
                console.log(`OTP reused. Waiting ${previousTtl}s before retrying...`);
                await new Promise(resolve => setTimeout(resolve, previousTtl * 1000));
                otpData = await generateAndDecryptOtp();
            }
        }
        pm.collectionVariables.set("decryptedOtp", otpData.code);
        pm.collectionVariables.set("secondsRemaining", otpData.secondsRemaining);

        return otpData.code;

    };

    utils.requestAccess = async function requestAccess(username, servicePublicKey, options = {}) {
        const payload = {
            tenantId: pm.environment.get("tenantId"),
            communityId: pm.environment.get("communityId"),
            username: username
        };
        if (options.password) {
            payload.password = options.password;
        } else if (options.otp && options.jwt) {
            // key for OTP
            const otpKey = options.otpType || "web_otp"; // backward compatibility
            payload[otpKey] = options.otp;
        } else {
            console.error("Invalid requestAccess options");
        }
        utils.prettyPrint(payload)
        const [enc_request_id, enc_license_key, enc_data, enc_jwt] = await Promise.all([
            this.encryptDataWithEnvKeys(JSON.stringify(this.generateRequestId()), servicePublicKey),
            this.encryptDataWithEnvKeys(pm.environment.get("client_license"), servicePublicKey),
            this.encryptDataWithEnvKeys(JSON.stringify(payload), servicePublicKey),
            options.jwt ? this.encryptDataWithEnvKeys(options.jwt, servicePublicKey) : Promise.resolve(null)
        ]);
        const headers = {
            "Content-Type": "application/json",
            publickey: pm.environment.get("my_public_key"),
            requestid: enc_request_id,
            licensekey: enc_license_key
        };
        if (enc_jwt) {
            headers.Authorization = "Bearer " + enc_jwt;
        }
        const response = await this.request.post(
            `${pm.environment.get("adminapi")}/v2/request_access`,
            { headers, data: { data: enc_data } }
        );
        const decrypted = await this.decryptDataWithEnvKeys(response.json().data, servicePublicKey);
        pm.collectionVariables.set("jwt", decrypted.jwt);
        return decrypted.jwt;
    };

    utils.loginWithPwdAndOtp = async function loginWithPwdAndOtp(username) {
        try {
            console.log("Starting authentication flow...");

            const servicePublicKey = await this.fetchServicePublicKey(pm.environment.get("adminapi"));
            pm.collectionVariables.set("servicePublicKey", servicePublicKey);

            console.log("Step 1: Initial login...");
            const jwt = await this.requestAccess(username, servicePublicKey, { password: "1Kosmos123$" });

            console.log("Step 2: Generate OTP...");
            const otp = await this.generateOTP(username);

            console.log("Step 3: Final access with OTP...");
            const finalServicePublicKey = await this.fetchServicePublicKey(pm.environment.get("adminapi"));
            pm.collectionVariables.set("servicePublicKey", finalServicePublicKey);

            const finaljwt = await this.requestAccess(username, finalServicePublicKey, { otp, jwt });

            console.log("All preparation steps completed successfully");
            return finaljwt;
        } catch (error) {
            console.error("Error in preparation flow:", error);
            throw error;
        }
    };

    utils.fetchServicePublicKey = async function fetchServicePublicKey(apiUrl, tag) {
        try {
            const headers = {
                "Content-Type": "application/json",
            };

            if (tag) {
                headers["X-TenantTag"] = tag;
            }

            const healthzUrl = tag
                ? `${pm.environment.get("adminconsole")}/healthz`
                : `${apiUrl}/healthz`;

            const healthz = await this.request.get(healthzUrl, { headers });
            const serviceVersion = healthz.json()
            console.log(`Healthz check (${healthzUrl}) version: ${serviceVersion.version}`);

            const response = await this.request.get(
                `${apiUrl}/publickeys`,
                { headers: headers }
            );

            if (response.status() !== 200) {
                throw new Error(`Failed to fetch server public key: ${response.status()}`);
            }

            const result = response.json();
            return result.publicKey;
        } catch (error) {
            console.error("Error fetching server public key:", error);
            throw error;
        }
    };

    utils.fetchCurrentVersion = async function fetchCurrentVersion(apiUrl, service = 'admin') {
        try {
            const headers = {
                "Content-Type": "application/json",
            };

            const response = await this.request.get(
                `${apiUrl}/${service}/healthz`,
                { headers: headers }
            );

            if (response.status() !== 200) {
                throw new Error(`Failed to fetch Current Version of UI: ${response.status()}`);
            }

            const result = response.json();
            const version = result?.version.match(/^\d+\.\d+\.\d+/)?.[0];
            console.log(`Current version for ${service}: `, version);
            pm.collectionVariables.set('currentVersion', version);
            return version;
        } catch (error) {
            console.error("Error fetch Current Version:", error);
            throw error;
        }
    };

    utils.fetchAdminXuiVersionId = async function fetchAdminXuiVersionId() {
        try {
            const headers = {
                "Content-Type": "application/json",
                "Authorization": pm.environment.get("JIRA_TOKEN")
            };

            const response = await this.request.get(
                `https://onekosmos.atlassian.net/rest/api/2/project/10047/versions`,
                { headers: headers }
            );

            if (response.status() !== 200) {
                throw new Error(`Failed to AdminX UI Version ID: ${response.status()}`);
            }

            const result = response.json();
            let versionAdminxUI = result.filter(el => el.name.includes("adminxui:" + pm.collectionVariables.get("adminxuiVersion")))
            console.log("versionAdminxUI: ", versionAdminxUI)
            pm.collectionVariables.set("JIRA_adminxui_versionID", versionAdminxUI[0].id);
            return versionAdminxUI[0].id;
        } catch (error) {
            console.error("Error fetch Current Version of UI:", error);
            throw error;
        }
    };

    utils.baseTests = function baseTests() {
        pm.test("Status code is 200", function () {
            pm.response.to.have.status(200);
        });
    };

    utils.encryptDataWithEnvKeys = async function encryptDataWithEnvKeys(dataStr, servicePublicKey, privateKey) {
        const effectivePrivateKey = privateKey || pm.environment.get("my_private_key");
        try {
            const encryptionResponse = await utils.request.post(
                `${pm.environment.get('caas')}/ecdsa_helper/encrypt`,
                {
                    headers: { "Content-Type": "application/json" },
                    data: {
                        dataStr: dataStr,
                        publicKey: servicePublicKey,
                        privateKey: effectivePrivateKey,
                    }
                }
            );

            if (encryptionResponse.status() !== 200) {
                throw new Error(`Encryption failed: ${encryptionResponse.status()}`);
            }

            return encryptionResponse.json().data;
        } catch (error) {
            console.error("Error in encryptDataWithEnvKeys:", error);
            throw error;
        }
    };

    utils.decryptDataWithEnvKeys = async function decryptDataWithEnvKeys(dataStr, servicePublicKey, privateKey, url=pm.request.url.toString()) {
        const effectivePrivateKey = privateKey || pm.environment.get("my_private_key");
        console.log("TEST URL (before decrypt): ", url);
        try {
            const decryptedResponse = await utils.request.post(
                `${pm.environment.get('caas')}/ecdsa_helper/decrypt`,
                {
                    headers: { "Content-Type": "application/json" },
                    data: {
                        dataStr: dataStr,
                        publicKey: servicePublicKey,
                        privateKey: effectivePrivateKey
                    }
                }
            );

            if (decryptedResponse.status() === 200) {
                return JSON.parse(decryptedResponse.json().data);
            } else {
                throw new Error(`Decryption failed: ${decryptedResponse.status()}`);
            }
        } catch (error) {
            console.error(`Decryption failed with exception:`, error.message);
            throw error;
        }
    };

    utils.setVars = function setVars(vars) {
        Object.entries(vars).forEach(([key, value]) => {
            pm.collectionVariables.set(key, value);
        });
    };

    utils.sleep = function sleep(ms) {
        const start = Date.now();
        while (Date.now() - start < ms) {
        }
    };

    utils.expectPropertyExists = function expectPropertyExists(obj, path, value) {
        if (value !== undefined) {
            pm.test(`Property "${path}" exists in Response and equals "${value}"`, () => {
                const val = path.split('.').reduce((o, k) => (o || {})[k], obj);
                pm.expect(val).to.not.be.undefined;
                pm.expect(val).to.equal(value);
            });
        } else {
            pm.test(`Property "${path}" exists and valid in response`, () => {
                const val = path.split('.').reduce((o, k) => (o || {})[k], obj);
                pm.expect(val).to.not.be.undefined;
            });
        }
    };

    utils.expectPropertyExistsNew = function expectPropertyExistsNew(obj, path, expectedValue) {
        const deepValue = path.split('.').reduce((o, k) => (o || {})[k], obj);

        if (deepValue !== undefined) {
            pm.test(`Nested property "${path}" exists`, () => {
                pm.expect(deepValue).to.not.be.undefined;
                if (expectedValue !== undefined) {
                    pm.expect(deepValue).to.eql(expectedValue);
                }
            });
            return;
        }
        const flatValue = obj[path];

        pm.test(`Flat property "${path}" exists`, () => {
            pm.expect(flatValue).to.not.be.undefined;
            if (expectedValue !== undefined) {
                pm.expect(flatValue).to.eql(expectedValue);
            }
        });
    };

    utils.fetchAllRoles = async function fetchAllRoles() {
        try {
            const apiUrl = pm.environment.get("authz");
            console.log("Authz API:", apiUrl);

            const servicePublicKey = await this.fetchServicePublicKey(`${apiUrl}/publickeys`);
            pm.collectionVariables.set("servicePublicKey", servicePublicKey);

            const [enc_request_id, enc_license_key] = await Promise.all([
                this.encryptDataWithEnvKeys(JSON.stringify(this.generateRequestId()), servicePublicKey),
                this.encryptDataWithEnvKeys(pm.environment.get("client_license"), servicePublicKey)
            ]);

            if (!enc_request_id || !enc_license_key) {
                throw new Error("Missing encryption variables from fetchAllRoles step");
            }

            const headers = {
                "Content-Type": "application/json",
                publickey: pm.environment.get("my_public_key"),
                requestid: enc_request_id,
                licensekey: enc_license_key,
            };

            const body = {
                tenantId: pm.environment.get("tenantId"),
                communityId: pm.environment.get("communityId"),
            };

            const response = await this.request.post(`${apiUrl}/roles/fetch`, {
                headers,
                data: body,
            });

            const respBody = await response.json();
            if (response.status() !== 200) {
                throw new Error(`Fetch roles failed with status ${response.status()}: ${JSON.stringify(respBody)}`);
            }

            pm.collectionVariables.set("rolesList", JSON.stringify(respBody));
            console.log("✅ Roles fetched:", respBody);
            return respBody;

        } catch (err) {
            console.error("❌ Error in fetchAllRoles:", err);
            throw err;
        }
    };

    utils.generateUUID = function generateUUID() {
        // Simple UUID v4 replacement that works in Newman
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    };

    utils.createUserNewRole = async function createUserNewRole(
        roleName = pm.variables.replaceIn("{{$randomUserName}}"),
        permissionsToAdd = [
            "users.all-users",
            "users.view-user",
            "users.edit",
            "user.generate.qr",
        ]
    ) {
        try {
            const apiUrl = pm.environment.get("client_api");
            const username = pm.environment.get("adminUser");

            const servicePublicKey = await this.fetchServicePublicKey(`${apiUrl}/authz/publickeys`);
            pm.collectionVariables.set("servicePublicKey", servicePublicKey);

            const payload = {
                name: roleName,
                description: "test_role",
                createdBy: username,
                permissions: permissionsToAdd,
                tenantId: pm.environment.get("tenantId"),
                communityId: pm.environment.get("communityId"),
            };

            this.prettyPrint(payload);

            const [enc_request_id, enc_license_key, enc_data] = await Promise.all([
                this.encryptDataWithEnvKeys(JSON.stringify({
                    ts: Math.floor(Date.now() / 1000),
                    appid: pm.environment.get("appId"),
                    uuid: pm.variables.replaceIn('{{$guid}}'),
                }), servicePublicKey),
                this.encryptDataWithEnvKeys(pm.environment.get("client_license"), servicePublicKey),
                this.encryptDataWithEnvKeys(JSON.stringify(payload), servicePublicKey),
            ]);

            this.setVars({
                enc_request_id,
                enc_license_key,
                enc_data,
            });

            const headers = {
                "Content-Type": "application/json",
                publickey: pm.environment.get("my_public_key"),
                requestid: enc_request_id,
                licensekey: enc_license_key,
            };

            const response = await this.request.put(`${apiUrl}/authz/role`, {
                headers,
                data: payload,
            });

            if (response.status() !== 200) {
                throw new Error(`Create User role request failed with: ${await response.json()}`);
            }

            const json = await response.json();
            pm.collectionVariables.set("newRoleId", json.id);
            pm.collectionVariables.set("newRoleName", json.name);
            console.log("✅ Role created:", json);
            return json;

        } catch (err) {
            console.error("Error in createUserNewRole:", err);
            throw err;
        }
    };


    utils.setUserRole = async function setUserRole(
        roleId = pm.environment.get("newRoleId"),
        username = "impressive-patroller"
    ) {
        try {
            const apiUrl = pm.environment.get("client_api");

            const servicePublicKey = await this.fetchServicePublicKey(`${apiUrl}/authz/publickeys`);
            pm.collectionVariables.set("servicePublicKey", servicePublicKey);

            const userData = await this.fetchSingleUserByUsername(username);

            const payload = {
                createdBy: pm.environment.get("adminUser"),
                objectType: "user",
                objectId: userData.data.uid,
                subjectType: "community",
                subjectId: pm.environment.get("communityId"),
                roleId: roleId,
            };

            this.prettyPrint(payload);

            const [enc_request_id, enc_license_key, enc_data] = await Promise.all([
                this.encryptDataWithEnvKeys(JSON.stringify({
                    ts: Math.floor(Date.now() / 1000),
                    appid: pm.environment.get("appId"),
                    uuid: pm.variables.replaceIn('{{$guid}}'),
                }), servicePublicKey),
                this.encryptDataWithEnvKeys(pm.environment.get("client_license"), servicePublicKey),
                this.encryptDataWithEnvKeys(JSON.stringify(payload), servicePublicKey),
            ]);

            this.setVars({
                enc_request_id,
                enc_license_key,
                enc_data,
            });

            const response = await this.request.put(`${apiUrl}/authz/authorization`, {
                headers: {
                    "Content-Type": "application/json",
                    publickey: pm.environment.get("my_public_key"),
                    requestid: enc_request_id,
                    licensekey: enc_license_key,
                },
                data: payload,
            });

            if (response.status() !== 200) {
                throw new Error(`Set User Role request failed with: ${await response.json()}`);
            }

            return await response.json();
        } catch (err) {
            console.error("Error in setUserRole:", err);
            throw err;
        }
    };


    utils.prettyPrint = function prettyPrint(data) {
        try {
            if (typeof data === 'object') {
                console.log(JSON.stringify(data, null, 2));
            } else {
                console.log(data);
            }
        } catch (error) {
            console.error("Error in prettyPrint:", error);
        }
    };

    utils.getRandomDevice = function getRandomDevice() {
        const devicesArray = JSON.parse(pm.environment.get("devices"));
        const randomIndex = Math.floor(Math.random() * devicesArray.length);
        return devicesArray[randomIndex];
    };

    utils.getDeviceByOS = function getDeviceByOS(targetOS) {
        const devicesArray = JSON.parse(pm.environment.get("devices"));
        return devicesArray.filter(device => device.os === targetOS);
    };

    utils.fetchTenantCommunityInfo = async function fetchTenantCommunityInfo(env, callback) {
        let url = env.api + "/api/r1/system/community_info/fetch";
        let dns = pm.environment.get("dns");
        let payload = {
            dns: dns,
            communityName: pm.environment.get("client_community_name")
        };
        let payloadStr = JSON.stringify(payload);

        pm.sendRequest({
            url: url,
            method: 'POST',
            header: {
                'Content-Type': 'application/json',
                'Content-Length': payloadStr.length
            },
            body: {
                mode: 'raw',
                raw: payloadStr
            }
        }, function (err, res) {
            let community = res.json().community;
            let tenant = res.json().tenant;
            pm.environment.set("communityId", community.id);
            pm.environment.set("tenantId", community.tenantid);
            pm.environment.set("client_tenant_tag", tenant.tenanttag);
        });

        let payload_pair = {
            dns: dns,
            communityName: pm.environment.get("pair_community_name")
        };
        let payloadStrPair = JSON.stringify(payload_pair);

        pm.sendRequest({
            url: url,
            method: 'POST',
            header: {
                'Content-Type': 'application/json',
                'Content-Length': payloadStrPair.length
            },
            body: {
                mode: 'raw',
                raw: payloadStrPair
            }
        }, function (err, res) {
            let community = res.json().community;
            pm.environment.set("pairCommunityId", community.id);
        });

        let url_root = env.root_env + "/api/r1/system/community_info/fetch";
        let dns_root = env.root_dns;
        let payload_root = {
            dns: dns_root,
            communityName: "default"
        };
        let payloadStr_root = JSON.stringify(payload_root);
        pm.sendRequest({
            url: url_root,
            method: 'POST',
            header: {
                'Content-Type': 'application/json',
                'Content-Length': payloadStr_root.length
            },
            body: {
                mode: 'raw',
                raw: payloadStr_root
            }
        }, function (err, res) {
            let tenant = res.json().tenant;
            pm.environment.set("root_tenant_tag", tenant.tenanttag);
            callback();
        });
    };

    utils.getSD = async function getSD(env, callback) {
        let url = env.api + "/caas/sd";
        pm.sendRequest({
            url: url,
            method: 'GET',
            header: {
                'Content-Type': 'application/json'
            }
        }, function (err, res) {
            var data = res.json();
            pm.environment.set("adminconsole", data.adminconsole);
            pm.environment.set("rootAdminconsole", pm.environment.get("root_api"));
            pm.environment.set("caas", data.adminconsole + "/caas");
            pm.environment.set("adminapi", data.adminconsole + "/adminapi");
            pm.environment.set("user_management", data.user_management);
            pm.environment.set("authn", data.authn);
            pm.environment.set("rules_engine", data.rules_engine);
            pm.environment.set("licenses", data.licenses);
            pm.environment.set("sessions", data.sessions);
            pm.environment.set("walletapi", data.walletapi);
            pm.environment.set("synthetic-health", data.adminconsole + "/synthetic-health");
            pm.environment.set("webhooks", data.adminconsole + "/webhooks");
            pm.environment.set("idproofingapi", data.adminconsole + "/idproofingapi");
            pm.environment.set("idvaapi", data.adminconsole + "/idvaapi");
            pm.environment.set("ipfsproxy", data.adminconsole + "/ipfsproxy");
            pm.environment.set("oauth2", data.adminconsole + "/oauth2");
            pm.environment.set("events", data.adminconsole + "/events");
            pm.environment.set("uwl1s", data.adminconsole + "/uwl1s");
            pm.environment.set("vcs", data.adminconsole + "/vcs");
            pm.environment.set("webauthn", data.webauthn);
            pm.environment.set("wstrust", data.adminconsole + "/wstrust");
            pm.environment.set("global_caas", data.global_caas);
            pm.environment.set("reports", data.reports);
            pm.environment.set("authz", data.authz);
            pm.environment.set("docuverify", data.global_caas.replace("/caas", "/docuverify"));
            pm.environment.set("xurl", data.global_caas.replace("/caas", "/xurl"));
            pm.environment.set("xapi-idrnd", data.global_caas.replace("/caas", "/xapi-idrnd"));
            pm.environment.set("xapi-rekognition", data.global_caas.replace("/caas", "/xapi-rekognition"));
            pm.environment.set("xapi-tracers", data.global_caas.replace("/caas", "/xapi-tracers"));
            pm.environment.set("xapi-aamvaj", data.global_caas.replace("/caas", "/xapi-aamvaj"));
            pm.environment.set("appId", "postman");
            pm.environment.set("cyberArkProxyUrl", "35.207.61.98:1389");
            callback();
        });
    };

    utils.fetchAuthModuleId = async function fetchAuthModuleId(moduleType = "", communityId, moduleName = "") {
        try {
            const url = pm.environment.get("client_api");
            const servicePublicKey = await this.fetchServicePublicKey(url + "/users-mgmt/publickeys");

            const requestId = this.generateRequestId();
            const encRequestId = await this.encryptDataWithEnvKeys(JSON.stringify(requestId), servicePublicKey);
            const encLicenseKey = await this.encryptDataWithEnvKeys(pm.environment.get("client_license"), servicePublicKey);

            const response = await this.request.post(
                `${pm.environment.get("client_api")}/users-mgmt/tenant/${pm.environment.get("tenantId")}/community/${communityId}/modules/fetch`,
                {
                    headers: {
                        "Content-Type": "application/json",
                        publickey: pm.environment.get("my_public_key"),
                        requestid: encRequestId,
                        licensekey: encLicenseKey,
                    },
                    data: {},
                }
            );

            if (response.status() !== 200) {
                throw new Error(`Fetch Auth Module request failed with: ${await response.json()}`);
            }

            const parsedJson = await this.decryptDataWithEnvKeys(response.json().data, servicePublicKey);

            const filteredModules = parsedJson.modules.filter(mod => {
                return (moduleType ? mod.type === moduleType : true) &&
                    (moduleName ? mod.name === moduleName : true);
            });

            if (filteredModules.length === 0) {
                throw new Error(`Module with type "${moduleType}" and name "${moduleName}" not found in community ${communityId}`);
            }

            return filteredModules[0]._id;

        } catch (error) {
            console.error("Error during fetching auth module:", error);
            throw error;
        }
    };
    utils.returnLicenseData = async function returnLicenseData(license) {
        const servicePublicKey = await utils.fetchServicePublicKey(pm.environment.get("licenses"));
        const [enc_request_id, enc_license_key] = await Promise.all([
            utils.encryptDataWithEnvKeys(JSON.stringify(utils.generateRequestId()), servicePublicKey),
            utils.encryptDataWithEnvKeys(license, servicePublicKey)
        ]);

        utils.setVars({
            enc_request_id,
            enc_license_key
        });
        const responseKey = await utils.request.get(
            `${pm.environment.get("licenses")}/servicekey/current`,
            {
                headers: {
                    "publickey": pm.environment.get("my_public_key"),
                    "requestid": enc_request_id,
                    "licensekey": enc_license_key,
                    "Content-Type": "application/json"
                }
            }
        );
        if (responseKey.status() !== 200) {
            throw new Error(`License check failed with status ${responseKey.status()}: ${JSON.stringify(responseKey.json())}`);
        }
        return responseKey.json()
    }
    utils.expectPropertyExistsNew = function expectPropertyExistsNew(obj, path, expectedValue) {
        const deepValue = path.split('.').reduce((o, k) => (o || {})[k], obj);

        if (deepValue !== undefined) {
            pm.test(`Nested property "${path}" exists`, () => {
                pm.expect(deepValue).to.not.be.undefined;
                if (expectedValue !== undefined) {
                    pm.expect(deepValue).to.eql(expectedValue);
                }
            });
            return;
        }

        const flatValue = obj[path];

        pm.test(`Flat property "${path}" exists`, () => {
            pm.expect(flatValue).to.not.be.undefined;
            if (expectedValue !== undefined) {
                pm.expect(flatValue).to.eql(expectedValue);
            }
        });
    };

    utils.fetchSingleUserByUsername = async function fetchSingleUserByUsername(
        username = pm.environment.get("adminUser"),
        communityId = pm.environment.get("communityId"),
        authModule = null,
        attributes = []
    ) {
        try {
            let url = pm.environment.get("client_api");
            const servicePublicKey = await this.fetchServicePublicKey(url + "/users-mgmt/publickeys");

            // Prepare request ID
            const requestId = this.generateRequestId();

            // Encrypt request ID
            const encRequestId = await this.encryptDataWithEnvKeys(JSON.stringify(requestId), servicePublicKey);

            // Encrypt license key
            const encLicenseKey = await this.encryptDataWithEnvKeys(pm.environment.get("client_license"), servicePublicKey);

            // Prepare request body
            const requestBody = {
                username: username,
            };

            // Add optional parameters to request body if provided
            if (authModule) {
                requestBody.authModule = authModule;
            }

            if (attributes && attributes.length > 0) {
                requestBody.attributes = attributes;
            }

            // Make fetch user by username request
            const response = await this.request.post(
                `${pm.environment.get("client_api")}/users-mgmt/tenant/${pm.environment.get("tenantId")}/community/${communityId}/user/fetch_single_user_by_username`,
                {
                    headers: {
                        "Content-Type": "application/json",
                        publickey: pm.environment.get("my_public_key"),
                        requestid: encRequestId,
                        licensekey: encLicenseKey,
                    },
                    data: requestBody,
                }
            );

            if (response.status() !== 200) {
                throw new Error(`User not found: ${username}`);
            }

            const jsonData = response.json();
            return jsonData;
        } catch (error) {
            console.error("Error during fetching single user by username:", error);
            throw error;
        }
    };

    utils.createNewUserAndReturnUserObject = async function createNewUserAndReturnUserObject(
        userName = pm.variables.replaceIn("{{$randomUserName}}"),
        mail = "1kosmos.com",
        communityId = pm.environment.get("communityId"),
        moduleType = "db",
        moduleName = "db",
        includeSecondaryEmail = false,
        excludePhone = false
    ) {
        try {
            // Ensure service public key is available
            let url = pm.environment.get("client_api");
            const servicePublicKey = await this.fetchServicePublicKey(url + "/users-mgmt/publickeys");

            // Prepare request ID
            const requestId = this.generateRequestId();

            // Encrypt request ID
            const encRequestId = await this.encryptDataWithEnvKeys(JSON.stringify(requestId), servicePublicKey);

            // Encrypt license key
            const encLicenseKey = await this.encryptDataWithEnvKeys(pm.environment.get("client_license"), servicePublicKey);

            let dbAuthModuleId;
            if (moduleType === "db") {
                dbAuthModuleId = await this.fetchAuthModuleId(moduleType, communityId);
            } else {
                throw new Error("Unsupported module type");
            }
            // console.log("ModuleID:", dbAuthModuleId)

            // Create base user data
            let userObject = {
                username: userName,
                password: pm.environment.get("password"),
                status: "active",
                firstname: userName + "_name",
                lastname: userName + "_lastname",
                email1: `test-${userName}@${mail}`,
                email1_verified: true,
                disabled: false,
            };

            // Add secondary email only if requested
            if (includeSecondaryEmail) {
                userObject.email2 = `secondary-${userName}@${mail}.com`;
                userObject.email2_verified = true;
            }

            // Remove phone number if requested
            if (excludePhone) {
                delete userObject.phone1;
                delete userObject.phone1_verified;
            }

            let userData = {
                authModule: dbAuthModuleId,
                users: [userObject],
            };

            // Make create user request
            const response = await this.request.put(
                `${pm.environment.get("client_api")}/users-mgmt/tenant/${pm.environment.get("tenantId")}/community/${communityId}/users/create`,
                {
                    headers: {
                        "Content-Type": "application/json",
                        publickey: pm.environment.get("my_public_key"),
                        requestid: encRequestId,
                        licensekey: encLicenseKey,
                    },
                    data: userData,
                }
            );

            if (response.status() !== 200) {
                throw new Error(`Create User request failed with: ${await response.json()}`);
            }

            // Fetch the full user object after creation
            const createdUser = await this.fetchSingleUserByUsername(userName);
            return createdUser.data;
        } catch (error) {
            console.error("Error during user creation:", error);
            throw error;
        }
    }
    utils.initializeHotpForCommunity = async function initializeHotpForCommunity() {
        var hotpDevices = JSON.parse(pm.environment.get("hotpDevicesJson"));

        var allSerialNumbers = hotpDevices.list.map(device => device.serialNumber);

        function getRandomItem(array) {
            return array[Math.floor(Math.random() * array.length)];
        }

        var selectedSerialNumbers = [];
        var serialNumber1, serialNumber2, serialNumber3;

        serialNumber1 = getRandomItem(allSerialNumbers);
        selectedSerialNumbers.push(serialNumber1);

        do {
            serialNumber2 = getRandomItem(allSerialNumbers);
        } while (serialNumber2 === serialNumber1);
        selectedSerialNumbers.push(serialNumber2);

        do {
            serialNumber3 = getRandomItem(allSerialNumbers);
        } while (serialNumber3 === serialNumber1 || serialNumber3 === serialNumber2);
        selectedSerialNumbers.push(serialNumber3);

        function generateRandomSerialNumber() {
            const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz";
            let result = "NEW-";
            for (let i = 0; i < 10; i++) {
                result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return result;
        }

        let serialNumber7;
        do {
            serialNumber7 = generateRandomSerialNumber();
        } while (allSerialNumbers.includes(serialNumber7));

        function createModifiedSerialNumber(originalSerialNumber) {
            return originalSerialNumber.split('').map(char => {
                if (Math.random() > 0.5) {
                    return char.toLowerCase() === char ? char.toUpperCase() : char.toLowerCase();
                }
                return char;
            }).join('');
        }

        let serialNumber2Modified;
        let attempts = 0;
        const maxAttempts = 10;

        do {
            if (attempts > 0 && attempts % 5 === 0) {
                console.log(`attempts ${attempts}: serialNumber2Modified same as serialNumber2`);

                selectedSerialNumbers.pop();


                do {
                    serialNumber2 = getRandomItem(allSerialNumbers);
                } while (serialNumber2 === serialNumber1 || selectedSerialNumbers.includes(serialNumber2));


                selectedSerialNumbers.push(serialNumber2);

                console.log(`Новый serialNumber2: ${serialNumber2}`);
            }

            serialNumber2Modified = createModifiedSerialNumber(serialNumber2);
            attempts++;

            if (attempts >= maxAttempts) {
                if (serialNumber2.length > 0 && /[a-zA-Z]/.test(serialNumber2[0])) {
                    const firstChar = serialNumber2[0];
                    const modifiedFirstChar = firstChar.toLowerCase() === firstChar ? firstChar.toUpperCase() : firstChar.toLowerCase();
                    serialNumber2Modified = modifiedFirstChar + serialNumber2.slice(1);
                } else {
                    serialNumber2Modified = 'A' + serialNumber2;
                }
                break;
            }

        } while (serialNumber2Modified === serialNumber2);

        console.log(`original serialNumber2: ${serialNumber2}`);
        console.log(`Modified serialNumber2Modified: ${serialNumber2Modified}`);
        console.log(`attempts count: ${attempts}`);

        var result = {
            list: [
                {
                    serialNumber: serialNumber1,
                    username: "andrii1"
                },
                {
                    serialNumber: serialNumber2,
                    username: "andrii1"
                },
                {
                    serialNumber: serialNumber2,
                    username: "andrii2"
                },
                {
                    serialNumber: serialNumber2Modified,
                    username: "andrii2"
                },
                {
                    serialNumber: serialNumber2,
                    username: "ANDRII2"
                },
                {
                    serialNumber: serialNumber3,
                    username: "ANDRII2"
                },
                {
                    serialNumber: serialNumber3,
                    username: "andrii.ziazin"
                }
            ]
        };


        var deviceWithSerialNumber2 = hotpDevices.list.find(device => device.serialNumber === serialNumber2);

        if (deviceWithSerialNumber2 && deviceWithSerialNumber2.seed) {
            pm.collectionVariables.set("currentSeed", deviceWithSerialNumber2.seed);
            console.log("Saved seed for " + serialNumber2 + ": " + deviceWithSerialNumber2.seed);
        } else {
            console.log("Device with serialNumber " + serialNumber2 + " not found or has no seed.");
            pm.collectionVariables.set("currentSeed", "");
        }

        var stringArray = result.list.map(item =>
            `${item.serialNumber},${item.username}`
        );

        let usernameMappingText = stringArray.join('\n');

        pm.collectionVariables.set("usernameMappingAsText", usernameMappingText);
        pm.collectionVariables.set("usernameMapping", JSON.stringify(result));
        pm.collectionVariables.set("serialNumbertoDelete", serialNumber1);
        pm.collectionVariables.set("serialNumbertoSearch", serialNumber2);
        pm.collectionVariables.set("userAssigned", "andrii1");
    }

    utils.addNewHOTPTokensWithList = async function addNewHOTPTokensWithList() {
        try {
            const apiUrl = pm.environment.get("adminconsole");
            const communityName = pm.environment.get("client_community_name");
            const tag = pm.environment.get("client_tenant_tag");
            console.log(communityName, tag)
            const servicePublicKey = await this.fetchServicePublicKey(
                `${apiUrl}/api/r1/community/${communityName}`,
                tag
            );
            const [enc_request_id, enc_license_key] = await Promise.all([
                this.encryptDataWithEnvKeys(JSON.stringify(this.generateRequestId()), servicePublicKey),
                this.encryptDataWithEnvKeys(pm.environment.get("client_license"), servicePublicKey)
            ]);

            utils.setVars({
                enc_request_id,
                enc_license_key
            });
            //    const servicePublicKey = await this.fetchServicePublicKey(apiUrl + "/authz/publickeys");
            const hotpDevicesJson = JSON.parse(pm.collectionVariables.get("hotpDevicesJson"));
            const payload = {
                ...hotpDevicesJson,
                eventData: {
                    user_id: 'cadmin',
                    caller_ip: '10.141.10.12',
                },
            };

            const requestId = this.generateRequestId();

            const encRequestId = await this.encryptDataWithEnvKeys(
                JSON.stringify(requestId),
                servicePublicKey
            );

            const encLicenseKey = await this.encryptDataWithEnvKeys(
                pm.environment.get("client_license"),
                servicePublicKey
            );

            const headers = {
                "Content-Type": "application/json",
                publickey: pm.environment.get("my_public_key"),
                requestid: encRequestId,
                licensekey: encLicenseKey,
                ["X-TenantTag"]: pm.environment.get("client_tenant_tag"),
            };

            const putUrl = `${apiUrl}/api/r2/${communityName}/hardwaretokens`;

            const response = await this.request.put(putUrl, {
                headers,
                data: payload,
            });

            if (response.status() !== 200) {
                throw new Error(`Request failed with: ${JSON.stringify(await response.json())}`);
            }


            return response.json();

        } catch (error) {
            console.error("Error in addNewHOTPTokensWithList:", error);
            throw error;
        }
    };
    utils.prepareBasicEncryptedRequestAndSendUserTokens = async function prepareBasicEncryptedRequestAndSendUserTokens() {
        try {
            const apiUrl = pm.environment.get("adminconsole");
            const communityName = pm.environment.get("client_community_name");
            const tag = pm.environment.get("client_tenant_tag");

            if (!apiUrl || !communityName || !tag) {
                throw new Error("Missing required environment variables: adminconsole, client_community_name, or client_tenant_tag");
            }

            const servicePublicKey = await this.fetchServicePublicKey(
                `${apiUrl}/api/r1/community/${communityName}`,
                tag
            );

            const [enc_request_id, enc_license_key] = await Promise.all([
                this.encryptDataWithEnvKeys(JSON.stringify(this.generateRequestId()), servicePublicKey),
                this.encryptDataWithEnvKeys(pm.environment.get("client_license"), servicePublicKey)
            ]);

            this.setVars({
                enc_request_id,
                enc_license_key
            });

            const originalUsernameMapping = pm.collectionVariables.get("usernameMapping");
            const requestBody = {
                list: JSON.parse(originalUsernameMapping).list.slice(0, 2)
            };

            pm.environment.set("requestBody", JSON.stringify(requestBody));

            const headers = {
                "Content-Type": "application/json",
                publickey: pm.environment.get("my_public_key"),
                requestid: enc_request_id,
                licensekey: enc_license_key,
                ["X-TenantTag"]: tag,
            };

            const putUrl = `${apiUrl}/api/r2/${communityName}/usertokens`;

            const response = await this.request.put(putUrl, {
                headers,
                data: requestBody
            });

            if (response.status() !== 200) {
                throw new Error(`Request failed with: ${JSON.stringify(await response.json())}`);
            }

            const responseData = await response.json();
            console.log("✅ PUT /usertokens successful:", responseData);
            return responseData;

        } catch (error) {
            console.error("Error in prepareBasicEncryptedRequestAndSendUserTokens:", error);
            throw error;
        }
    };

    utils.prepareUserFetchRequestAndSend = async function prepareUserFetchRequestAndSend() {
        try {
            const userManagementUrl = pm.environment.get("user_management");
            const tenantId = pm.environment.get("tenantId");
            const communityId = pm.environment.get("communityId");
            const clientApi = pm.environment.get("client_api");
            console.log(userManagementUrl, tenantId, communityId, clientApi)
            if (!userManagementUrl || !tenantId || !communityId || !clientApi) {
                throw new Error("Missing one of required environment variables: user_management, tenantId, communityId, client_api");
            }

            const servicePublicKey = await this.fetchServicePublicKey(`${clientApi}/users-mgmt/publickeys`);

            const [enc_request_id, enc_license_key] = await Promise.all([
                this.encryptDataWithEnvKeys(JSON.stringify(this.generateRequestId()), servicePublicKey),
                this.encryptDataWithEnvKeys(pm.environment.get("client_license"), servicePublicKey)
            ]);

            this.setVars({
                enc_request_id,
                enc_license_key
            });

            const headers = {
                "Content-Type": "application/json",
                publickey: pm.environment.get("my_public_key"),
                requestid: enc_request_id,
                licensekey: enc_license_key,
                ["X-TenantTag"]: pm.environment.get("client_tenant_tag"),
            };

            const payload = {
                username: pm.collectionVariables.get("test_username") || "testuser"
            };

            const postUrl = `${userManagementUrl}/tenant/${tenantId}/community/${communityId}/user/fetch_single_user_by_username`;

            const response = await this.request.post(postUrl, {
                headers,
                data: payload
            });

            if (response.status() !== 200) {
                throw new Error(`Request failed with: ${JSON.stringify(await response.json())}`);
            }

            const responseData = await response.json();
            console.log("✅ User fetched successfully:", responseData);
            return responseData;

        } catch (error) {
            console.error("❌ Error in prepareUserFetchRequestAndSend:", error);
            throw error;
        }
    };

    utils.deleteRole = async function deleteRole(roleId) {
        try {
            const apiUrl = pm.environment.get("adminconsole");
            const appId = pm.environment.get("appId");
            const myPrivateKey = pm.environment.get("my_private_key");
            const myPublicKey = pm.environment.get("my_public_key");
            const licenseKey = pm.environment.get("client_license");

            const servicePublicKey = await this.fetchServicePublicKey(apiUrl + "/authz/publickeys");

            const requestId = {
                ts: Math.floor(Date.now() / 1000),
                appid: appId,
                uuid: pm.variables.replaceIn('{{$guid}}'),
            };

            const encRequestId = await this.encryptDataWithEnvKeys(
                JSON.stringify(requestId),
                servicePublicKey,
                myPrivateKey
            );

            const encLicenseKey = await this.encryptDataWithEnvKeys(
                licenseKey,
                servicePublicKey,
                myPrivateKey
            );

            const headers = {
                "Content-Type": "application/json",
                publickey: myPublicKey,
                requestid: encRequestId,
                licensekey: encLicenseKey,
            };

            const response = await this.request.delete(`${apiUrl}/authz/role/${roleId}`, {
                headers,
            });

            if (response.status() !== 204) {
                let errorBody = "";
                try {
                    const json = await response.json();
                    errorBody = JSON.stringify(json, null, 2);
                } catch {
                    try {
                        errorBody = await response.text();
                    } catch {
                        errorBody = "No response body";
                    }
                }

                throw new Error(`Delete role request failed with status ${response.status()}:\n${errorBody}`);
            }

            console.log(`✅ Role with ID ${roleId} deleted successfully.`);
            return {};

        } catch (err) {
            console.error("Error in deleteRole:", err);
            throw err;
        }
    };

    utils.getDVCIDlist = async function getDVCIDlist() {
        try {
            const apiUrl = pm.environment.get("client_api");
            const appId = pm.environment.get("appId");
            const myPrivateKey = pm.environment.get("my_private_key");
            const myPublicKey = pm.environment.get("my_public_key");

            if (!this.servicePublicKeyIdvaapi) {
                await this.getServicePublicKeyIdVaapi();
            }

            const servicePublicKey = this.servicePublicKeyIdvaapi;

            const requestId = {
                ts: Math.floor(Date.now() / 1000),
                appid: appId,
                uuid: pm.variables.replaceIn('{{$guid}}'),
            };

            const encRequestId = await this.encryptDataWithEnvKeys(
                JSON.stringify(requestId),
                servicePublicKey,
                myPrivateKey
            );

            const adminLoginData = await this.adminLoginWithOTP();
            const encJWTtoken = await this.encryptDataWithEnvKeys(
                adminLoginData.jwt,
                servicePublicKey,
                myPrivateKey
            );

            const headers = {
                "Content-Type": "application/json",
                publickey: myPublicKey,
                requestid: encRequestId,
                authorization: `Bearer ${encJWTtoken}`,
            };

            const response = await this.request.get(`${apiUrl}/idvaapi/dvcid/list`, {
                headers,
            });

            if (response.status() !== 200) {
                let errorBody = "";
                try {
                    const json = await response.json();
                    errorBody = JSON.stringify(json, null, 2);
                } catch {
                    try {
                        errorBody = await response.text();
                    } catch {
                        errorBody = "No response body";
                    }
                }

                throw new Error(`DVCID request failed with status ${response.status()}:\n${errorBody}`);
            }

            const responseBody = await response.json();

            const decryptedResponse = await this.decryptData(
                responseBody.data,
                servicePublicKey,
                myPrivateKey
            );

            const parsedResult = JSON.parse(decryptedResponse);
            console.log("✅ DVCID list retrieved successfully:", parsedResult);
            return parsedResult;

        } catch (err) {
            console.error("❌ Error in getDVCIDlist:", err);
            throw err;
        }
    };

    utils.getServicePublicKeyIdVaapi = async function getServicePublicKeyIdVaapi() {
        try {
            const apiUrl = pm.environment.get("client_api");

            const response = await this.request.get(`${apiUrl}/idvaapi/publickeys`);

            if (response.status() !== 200) {
                let errorBody = "";
                try {
                    const json = await response.json();
                    errorBody = JSON.stringify(json, null, 2);
                } catch {
                    try {
                        errorBody = await response.text();
                    } catch {
                        errorBody = "No response body";
                    }
                }

                throw new Error(`Fetching IDVA API public key failed with status ${response.status()}:\n${errorBody}`);
            }

            const publicKeyData = await response.json();
            this.servicePublicKeyIdvaapi = publicKeyData.publicKey;

            console.log("✅ Retrieved IDVA API public key successfully.");
            return this.servicePublicKeyIdvaapi;

        } catch (err) {
            console.error("❌ Error in getServicePublicKeyIdVaapi:", err);
            throw err;
        }
    };

    utils.prepareResyncPayloadWithPreconditions = async function prepareResyncPayloadWithPreconditions() {
        try {

            // Proceed with resync logic
            const tenantTag = pm.environment.get("client_tenant_tag");
            const adminconsole = pm.environment.get("adminconsole");
            const community = pm.environment.get("client_community_name");
            const serialNumbertoSearch = pm.collectionVariables.get("serialNumbertoSearch");

            const serviceKeyUrl = `${adminconsole}/api/r1/community/${community}`;
            const servicePublicKey = await this.fetchServicePublicKey(serviceKeyUrl, tenantTag);
            const [enc_request_id, enc_license_key] = await Promise.all([
                this.encryptDataWithEnvKeys(JSON.stringify(this.generateRequestId()), servicePublicKey),
                this.encryptDataWithEnvKeys(pm.environment.get("client_license"), servicePublicKey)
            ]);

            this.setVars({ enc_request_id, enc_license_key });
            await new Promise(resolve => setTimeout(resolve, 100)); // ensure vars are set

            // Step 1: Fetch currentCounter
            const hardwareResp = await this.request.post(
                `${adminconsole}/api/r2/${community}/hardwaretokens/fetch`,
                {
                    headers: {
                        "publickey": pm.environment.get("my_public_key"),
                        "requestid": enc_request_id,
                        "licensekey": enc_license_key,
                        "X-TenantTag": tenantTag,
                        "Content-Type": "application/json"
                    },
                    data: {
                        query: {
                            serialNumbers: [serialNumbertoSearch]
                        },
                        returnAssignedUserCount: true,
                        returnActivityStatus: true
                    }
                }
            );

            const counterData = hardwareResp.json();
            const currentCounter = counterData.data[0].currentCounter;
            const currentSeed = pm.collectionVariables.get("currentSeed");

            pm.collectionVariables.set("currentCounter", currentCounter);
            await new Promise(resolve => setTimeout(resolve, 50));

            // Step 2: Fetch assigned username
            const userResp = await this.request.post(
                `${adminconsole}/api/r2/${community}/usertokens/fetch`,
                {
                    headers: {
                        "publickey": pm.environment.get("my_public_key"),
                        "requestid": enc_request_id,
                        "licensekey": enc_license_key,
                        "X-TenantTag": tenantTag,
                        "Content-Type": "application/json"
                    },
                    data: {
                        query: {
                            serialNumber: serialNumbertoSearch
                        }
                    }
                }
            );

            const userData = userResp.json();
            const userAssigned = userData.data[0].username;
            pm.collectionVariables.set("userAssigned", userAssigned);

            // Step 3: Generate 3 resync HOTP codes
            let rangeCounter = parseInt(currentCounter, 10) + 1;
            let resyncCodes;

            try {
                const resyncResp = await this.request.post("https://hotp.onrender.com/resync", {
                    headers: { "Content-Type": "application/json" },
                    data: { secret: currentSeed, counter: rangeCounter }
                });

                await new Promise(resolve => setTimeout(resolve, 1000));
                resyncCodes = resyncResp.json();
            } catch {
                resyncCodes = await new Promise((resolve, reject) => {
                    pm.sendRequest({
                        url: "https://hotp.onrender.com/resync",
                        method: "POST",
                        header: { "Content-Type": "application/json" },
                        body: {
                            mode: "raw",
                            raw: JSON.stringify({ secret: currentSeed, counter: rangeCounter })
                        }
                    }, (error, response) => {
                        if (error) return reject(error);
                        try {
                            const parsed = JSON.parse(response.body);
                            resolve(parsed);
                        } catch (e) {
                            reject(e);
                        }
                    });
                });

                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            resyncCodes.serialNumber = serialNumbertoSearch;



            // Step 4: Get IP address
            const ipRespRaw = await this.request.get("https://httpbin.org/ip", {
                header: { "Content-Type": "application/json" }
            });
            const ipResp = ipRespRaw.json();
            const myIP = ipResp.origin;
            pm.collectionVariables.set("my_ip", myIP);

            // Step 5: Final payload
            const payload = {
                code1: resyncCodes.code1 || "string",
                code2: resyncCodes.code2 || "string",
                code3: resyncCodes.code3 || "string",
                serialNumber: resyncCodes.serialNumber || "string",
                username: userAssigned,
                eventData: {
                    caller_ip: myIP,
                    user_id: pm.collectionVariables.get('test_user_id')
                }
            };

            pm.collectionVariables.set("request_payload", JSON.stringify(payload));
            await new Promise(resolve => setTimeout(resolve, 100)); // Final delay

            console.log("✅ Resync payload prepared successfully");

        } catch (error) {
            console.error("❌ Error in prepareResyncPayloadWithPreconditions:", error);
            throw error;
        }
    };

    // utils.generateHotpFromHex = function generateHotpFromHex(secret, counter, digits = 6, algorithm = "sha256") {
    //     if (!secret || typeof secret !== "string") {
    //         console.error("Secret must be a HEX string");
    //     }

    //     const cleanedSecret = secret.replace(/\s+/g, "").toUpperCase();
    //     if (!/^[0-9A-F]{40,}$/.test(cleanedSecret)) {
    //         console.error("Secret must be a HEX string of at least 40 characters");
    //     }

    //     if (typeof counter !== "number" || isNaN(counter)) {
    //         console.error("Counter must be a valid number");
    //     }

    //     const key = CryptoJS.enc.Hex.parse(cleanedSecret);

    //     // Convert counter to 8-byte buffer (big endian)
    //     const counterBytes = new Array(8).fill(0);
    // let tempCounter = counter;
    //     for (let i = 7; i >= 0; i--) {
    //         counterBytes[i] = tempCounter & 0xff;
    //         tempCounter = tempCounter >> 8;
    //     }
    //     const counterWordArray = CryptoJS.lib.WordArray.create(counterBytes);

    //     // Normalize algorithm (e.g., "sha-1" → "SHA1")
    //     const algo = algorithm.replace(/-/g, "").toUpperCase();
    //     let hmac;
    //     if (algo === "SHA1") {
    //         hmac = CryptoJS.HmacSHA1(counterWordArray, key);
    //     } else if (algo === "SHA256") {
    //         hmac = CryptoJS.HmacSHA256(counterWordArray, key);
    //     } else if (algo === "SHA512") {
    //         hmac = CryptoJS.HmacSHA512(counterWordArray, key);
    //     } else {
    //         console.error(`Unsupported algorithm: ${algorithm}`);
    //     }

    //     const hmacHex = CryptoJS.enc.Hex.stringify(hmac);

    //     // Get the last byte of the HMAC to determine offset
    //     const lastByteHex = hmacHex.substr(hmacHex.length - 2, 2);
    //     const offset = parseInt(lastByteHex, 16) & 0x0f;

    //     // Extract 4 bytes starting from offset
    //     const binary = ((parseInt(hmacHex.substr(offset * 2, 2), 16) & 0x7f) << 24) |
    //         (parseInt(hmacHex.substr(offset * 2 + 2, 2), 16) << 16) |
    //         (parseInt(hmacHex.substr(offset * 2 + 4, 2), 16) << 8) |
    //         (parseInt(hmacHex.substr(offset * 2 + 6, 2), 16));

    //     const otp = (binary % Math.pow(10, digits)).toString().padStart(digits, "0");
    //     return otp;
    // };

    utils.prepareHotpDevicesTestData = async function prepareHotpDevicesTestData() {
        const lines = [
            "AB123456789XYZ,B8B1200D818607222521906148AE62A8906B68BC,7",
            "12345-ABCDE-67890,FCE754A17D2E36B98C0B82914526FC9A3D5E87D1,23",
            "XYZ98765432100abc,A1F6D03E7C985B4210AD6F93E8472C51BD09438A,0",
            "0123456789ABCDEF,5E9C81736B4D0FA2E7153A9D482608FC71A5E24B,42",
            " ,6E73CED7FC51DE4419541A3F5F113C0AA197253A,42",
            ",6E73CED7FC51DE4419541A3F5F113C0AA197253A,42",
            "melon.ask,,",
            "melon.ask,",
            "melon.ask, ,",
            "SN-2025-05-17-001a,D71BA938C6F405E2D5091A7C43FB6058274E913D,15",
            "  12a34b56c78d90e,1F09E8D7C6B5A4321F09E8D7C6B5A4321F09E8D7,31",
            "CERT-F5A7B9C3D1E8,  B2D1C0A9F8E7D6C5B4A3F2E1D0C9B8A7F6E5D4C3",
            "123abc456DEF789,986DF209A36DA047FD6F87E2FCDCBF8C52B00BAC,",
            "P0L7aV4-UA-2025,98A7B6C5D4E3F2A1B0C9D8E7F6A5B4C3D2E1F098,19",
            "abcDEF123456789,1234567890ABCDEF1234567890ABCDEF12345678,36",
            "2025-05-17-SN-000X,ABCDEF0123456789ABCDEF0123456789ABCDEF01,1",
            "ZYX987WVu654321,76543210FEDCBA9876543210FEDCBA9876543210,47",
            "SerialNumber-0ABC1,FFAA55EE0011BB5577BB33AA99DD66CC88442200,29",
            "000X-111Y-222Z-333A,9876543210ABCDEF9876543210ABCDEF98765432,3",
            "SAML-1k-AUTH-2025-05,876543210ABCDEF0123456789ABCDEF123456789,17",
            "1122334455aaBBccDD,C01DFEE1BADDEED5CAFEBABE5CAFEFACE0FFEE1D,38",
            "UPPER-lower-12345-67890,F1E2D3C4B5A6978695A4B3C2D1E0F1E2D3C4B5A6,21",
            "ZYX987WVu654321,B8B1200D818607222521906148AE62A8906B68BC,47",
            "124646455367928652500795391237413177200586738418,A61E4D2E4933499F244623D962CAD70BB4D2B236,8",
            "AB12CD34EF56GH78IJ90,A55A0FF01DEAD5EA15BAD0FADE00F00DCAFEBABE,50",
            "TeSt-serial-NuMbEr-001,0123456789ABCDEF0123456789ABCDEF01234567,14",
            "0xABCDEF1234567890,FEDCBA9876543210FEDCBA9876543210FEDCBA98,33",
            "123-456-789-abc-def,FACE0FFDEC0DE2019BEEF5EEDAD1DAD5CAFEBEEF,27",
            "TeSt-SeRiAl-NuMbEr-001,0123456789ABCDEF0123456789ABCDEF01234567,25",
            "CertificateSerialNumber12345,ACC355C0D3BA5177B1A3D3EDF33DB553AB55BABE,6",
            "XMLSEC1-DECRYPT-TEST-2025,FFBFC68E9C6EA5BF96DBE050B0564F054630F359,44",
            "aA1bB2cC3dD4eE5fF6gG7,1A2B3C4D5E6F7A8B9C0D1E2F3A4B5C6D7E8F9A0B,12"
        ];

        const multilineText = lines.join('\n');
        pm.collectionVariables.set("hotpDevicesAsText", multilineText);
        pm.collectionVariables.set("hotpDevicesJson", JSON.stringify({
            "list": [
                {
                    "serialNumber": "AB123456789XYZ",
                    "seed": "B8B1200D818607222521906148AE62A8906B68BC",
                    "currentCounter": 7
                },
                {
                    "serialNumber": "12345-ABCDE-67890",
                    "seed": "FCE754A17D2E36B98C0B82914526FC9A3D5E87D1",
                    "currentCounter": 23
                },
                {
                    "serialNumber": "XYZ98765432100abc",
                    "seed": "A1F6D03E7C985B4210AD6F93E8472C51BD09438A"
                },
                {
                    "serialNumber": "0123456789ABCDEF",
                    "seed": "5E9C81736B4D0FA2E7153A9D482608FC71A5E24B",
                    "currentCounter": 42
                },


                {
                    "serialNumber": "SN-2025-05-17-001a",
                    "seed": "D71BA938C6F405E2D5091A7C43FB6058274E913D",
                    "currentCounter": 15
                },
                {
                    "serialNumber": "12a34b56c78d90e",
                    "seed": "1F09E8D7C6B5A4321F09E8D7C6B5A4321F09E8D7",
                    "currentCounter": 31
                },
                {
                    "serialNumber": "CERT-F5A7B9C3D1E8",
                    "seed": "  B2D1C0A9F8E7D6C5B4A3F2E1D0C9B8A7F6E5D4C3",
                    "currentCounter": 0
                },
                {
                    "serialNumber": "123abc456DEF789",
                    "seed": "986DF209A36DA047FD6F87E2FCDCBF8C52B00BAC",
                    "currentCounter": 0
                },
                {
                    "P0L7aV4-UA-2025": "98A7B6C5D4E3F2A1B0C9D8E7F6A5B4C3D2E1F098",
                    "currentCounter": 19
                },
                {
                    "serialNumber": "abcDEF123456789",
                    "seed": "1234567890ABCDEF1234567890ABCDEF12345678",
                    "currentCounter": 36
                },
                {
                    "serialNumber": "2025-05-17-SN-000X",
                    "seed": "ABCDEF0123456789ABCDEF0123456789ABCDEF01",
                    "currentCounter": 1
                },
                {
                    "serialNumber": "ZYX987WVu654321",
                    "seed": "76543210FEDCBA9876543210FEDCBA9876543210",
                    "currentCounter": 47
                },
                {
                    "serialNumber": "SerialNumber-0ABC1",
                    "seed": "FFAA55EE0011BB5577BB33AA99DD66CC88442200",
                    "currentCounter": 29
                },
                {
                    "serialNumber": "000X-111Y-222Z-333A",
                    "seed": "9876543210ABCDEF9876543210ABCDEF98765432",
                    "currentCounter": 3
                },
                {
                    "serialNumber": "SAML-1k-AUTH-2025-05",
                    "seed": "876543210ABCDEF0123456789ABCDEF123456789",
                    "currentCounter": 17
                },
                {
                    "serialNumber": "1122334455aaBBccDD",
                    "seed": "C01DFEE1BADDEED5CAFEBABE5CAFEFACE0FFEE1D",
                    "currentCounter": 38
                },
                {
                    "serialNumber": "UPPER-lower-12345-67890",
                    "seed": "F1E2D3C4B5A6978695A4B3C2D1E0F1E2D3C4B5A6",
                    "currentCounter": 21
                },
                {
                    "serialNumber": "ZYX987WVu654321",
                    "seed": "B8B1200D818607222521906148AE62A8906B68BC",
                    "currentCounter": 47
                },
                {
                    "serialNumber": "124646455367928652500795391237413177200586738418",
                    "seed": "A61E4D2E4933499F244623D962CAD70BB4D2B236",
                    "currentCounter": 8
                },
                {
                    "serialNumber": "AB12CD34EF56GH78IJ90",
                    "seed": "A55A0FF01DEAD5EA15BADCODE00F00DCAFEBABE",
                    "currentCounter": 50
                },
                {
                    "serialNumber": "TeSt-SeRiAl-NuMbEr-001",
                    "seed": "0123456789ABCDEF0123456789ABCDEF01234567",
                    "currentCounter": 14
                },
                {
                    "serialNumber": "0xABCDEF1234567890",
                    "seed": "FEDCBA9876543210FEDCBA9876543210FEDCBA98",
                    "currentCounter": 33
                },
                {
                    "serialNumber": "123-456-789-abc-def",
                    "seed": "FACE0FFDEC0DE2019BEEF5EEDAD1DAD5CAFEBEEF",
                    "currentCounter": 27
                },
                {
                    "serialNumber": "TeSt-SeRiAl-NuMbEr-001",
                    "seed": "0123456789ABCDEF0123456789ABCDEF01234567",
                    "currentCounter": 25
                },
                {
                    "serialNumber": "CertificateSerialNumber12345",
                    "seed": "ACC355C0D3BA5177B1A3D3EDF33DB553AB55BABE",
                    "currentCounter": 6
                },
                {
                    "serialNumber": "XMLSEC1-DECRYPT-TEST-2025",
                    "seed": "FFBFC68E9C6EA5BF96DBE050B0564F054630F359",
                    "currentCounter": 44
                },
                {
                    "serialNumber": "aA1bB2cC3dD4eE5fF6gG7",
                    "seed": "1A2B3C4D5E6F7A8B9C0D1E2F3A4B5C6D7E8F9A0B",
                    "currentCounter": 12
                }
            ]
        }));

        const hotpDevices = JSON.parse(pm.collectionVariables.get("hotpDevicesJson"));

        const allSerialNumbers = hotpDevices.list.map(device => device.serialNumber);

        function getRandomItem(array) {
            return array[Math.floor(Math.random() * array.length)];
        }

        let selectedSerialNumbers = [];
        let serialNumber1 = getRandomItem(allSerialNumbers);
        selectedSerialNumbers.push(serialNumber1);

        let serialNumber2;
        do {
            serialNumber2 = getRandomItem(allSerialNumbers);
        } while (serialNumber2 === serialNumber1);
        selectedSerialNumbers.push(serialNumber2);

        let serialNumber3;
        do {
            serialNumber3 = getRandomItem(allSerialNumbers);
        } while (serialNumber3 === serialNumber1 || serialNumber3 === serialNumber2);
        selectedSerialNumbers.push(serialNumber3);

        function generateRandomSerialNumber() {
            const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz";
            let result = "NEW-";
            for (let i = 0; i < 10; i++) {
                result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return result;
        }

        let serialNumber7;
        do {
            serialNumber7 = generateRandomSerialNumber();
        } while (allSerialNumbers.includes(serialNumber7));

        function createModifiedSerialNumber(originalSerialNumber) {
            return originalSerialNumber.split('').map(char => {
                return Math.random() > 0.5 ? (char === char.toLowerCase() ? char.toUpperCase() : char.toLowerCase()) : char;
            }).join('');
        }

        let serialNumber2Modified;
        let attempts = 0;
        const maxAttempts = 10;

        do {
            if (attempts > 0 && attempts % 5 === 0) {
                selectedSerialNumbers.pop();
                do {
                    serialNumber2 = getRandomItem(allSerialNumbers);
                } while (serialNumber2 === serialNumber1 || selectedSerialNumbers.includes(serialNumber2));
                selectedSerialNumbers.push(serialNumber2);
            }

            serialNumber2Modified = createModifiedSerialNumber(serialNumber2);
            attempts++;

            if (attempts >= maxAttempts) {
                if (serialNumber2.length > 0 && /[a-zA-Z]/.test(serialNumber2[0])) {
                    const modifiedFirstChar = serialNumber2[0].toLowerCase() === serialNumber2[0] ? serialNumber2[0].toUpperCase() : serialNumber2[0].toLowerCase();
                    serialNumber2Modified = modifiedFirstChar + serialNumber2.slice(1);
                } else {
                    serialNumber2Modified = 'A' + serialNumber2;
                }
                break;
            }
        } while (serialNumber2Modified === serialNumber2);

        let result = {
            list: [
                { serialNumber: serialNumber1, username: "andrii1" },
                { serialNumber: serialNumber2, username: "andrii1" },
                { serialNumber: serialNumber2, username: "andrii2" },
                { serialNumber: serialNumber2Modified, username: "andrii2" },
                { serialNumber: serialNumber2, username: "ANDRII2" },
                { serialNumber: serialNumber3, username: "ANDRII2" },
                { serialNumber: serialNumber3, username: "andrii.ziazin" },
                { serialNumber: serialNumber7, username: "andrii.ziazin" }
            ]
        };

        pm.collectionVariables.set("usernameMapping", JSON.stringify(result));
        pm.collectionVariables.set("test_username", result.list[0].username);
        pm.collectionVariables.set("serialNumbertoDelete", serialNumber1);
        pm.collectionVariables.set("serialNumbertoSearch", serialNumber2);
        pm.collectionVariables.set("userAssigned", "andrii1");

        const deviceWithSerialNumber2 = hotpDevices.list.find(device => device.serialNumber === serialNumber2);
        if (deviceWithSerialNumber2 && deviceWithSerialNumber2.seed) {
            pm.collectionVariables.set("currentSeed", deviceWithSerialNumber2.seed);
        } else {
            pm.collectionVariables.set("currentSeed", "");
        }

        let usernameMappingText = result.list.map(item =>
            `${item.serialNumber},${item.username}`
        ).join('\n');

        pm.collectionVariables.set("usernameMappingAsText", usernameMappingText);
    };

    utils.returnCaasSetting = async function returnCaasSetting(
    path = "blockid_session_attributes",
    scope = "community_external", // Options: "global_external", "global_platform", "platform_client", "global_internal", "community_external", "community_internal"
    communityId = pm.environment.get("communityId")
) {
    try {
        // Determine the API URL and context based on scope
        let url;
        let context;
        let endpoint;

        switch (scope) {
            case "global_external":
                url = pm.environment.get("root_api"); // Root CAAS
                context = {
                    appId: "adminconsole.global",
                    internal: false
                };
                endpoint = "/caas/config/fetch?read_fresh=true";
                break;

            case "global_platform":
                url = pm.environment.get("root_api"); // Root CAAS
                context = {
                    appId: "platform",
                    internal: true
                };
                endpoint = "/caas/config/fetch?read_fresh=true";
                break;

            case "global_internal":
                url = pm.environment.get("client_api"); // Client CAAS
                context = {
                    appId: "adminconsole.global",
                    internal: true
                };
                endpoint = "/caas/config/fetch?read_fresh=true";
                break;

            case "platform_client":
                url = pm.environment.get("client_api");
                context = {
                    appId: "platform",
                    internal: true
                };
                endpoint = "/caas/config/fetch?read_fresh=true";
                break;

            case "community_external":
                url = pm.environment.get("client_api");
                context = {
                    tenantId: pm.environment.get("tenantId"),
                    communityId: communityId,
                    internal: false
                };
                endpoint = "/caas/config/fetch?read_fresh=true";
                break;

            case "community_internal":
                url = pm.environment.get("client_api");
                context = {
                    tenantId: pm.environment.get("tenantId"),
                    communityId: communityId,
                    internal: true
                };
                endpoint = "/caas/config/fetch?read_fresh=true";
                break;

            default:
                throw new Error(`Invalid scope: ${scope}. Valid options: global_external, global_platform, global_internal, community_external, community_internal`);
        }

        // Ensure service public key is available
        const servicePublicKey = await this.fetchServicePublicKey(url + "/caas/publickeys");

        // Prepare request ID
        const requestId = this.generateRequestId();

        // Encrypt request ID
        const encRequestId = await this.encryptDataWithEnvKeys(JSON.stringify(requestId), servicePublicKey);

        // Encrypt license key
        const encLicenseKey = await this.encryptDataWithEnvKeys(pm.environment.get("client_license"), servicePublicKey);

        const payload = {
            context: context,
            key_paths: [path],
        };

        // Make fetch community configs request
        const response = await this.request.post(
            `${url}${endpoint}`,
            {
                headers: {
                    "Content-Type": "application/json",
                    publickey: pm.environment.get("my_public_key"),
                    requestid: encRequestId,
                    licensekey: encLicenseKey,
                },
                data: payload,
            }
        );

        if (response.status() !== 200) {
            throw new Error(`Fetch configs request failed with status ${response.status()}: ${await response.json()}`);
        }

        const responseData = response.json();
        console.log(`Settings for scope '${scope}': ${JSON.stringify(responseData)}`);
        return responseData.data;
    } catch (error) {
        console.error(`Error during fetching configs for scope '${scope}':`, error);
        throw error;
    }
};
    utils.getDevices = async function getDevices(username) {
        const tag = pm.environment.get("client_tenant_tag");
        let url = `${pm.environment.get("adminconsole")}/api/r1/community/${pm.environment.get("client_community_name")}`
        const servicePublicKey = await this.fetchServicePublicKey(url, tag);
        pm.collectionVariables.set("servicePublicKey", servicePublicKey);

        const [enc_request_id, enc_license_key] = await Promise.all([
            this.encryptDataWithEnvKeys(JSON.stringify(this.generateRequestId()), servicePublicKey),
            this.encryptDataWithEnvKeys(pm.environment.get("client_license"), servicePublicKey)
        ]);

        const headers = {
            'Content-Type': 'application/json',
            'X-TenantTag': tag,
            requestid: enc_request_id,
            licensekey: enc_license_key,
            publickey: pm.environment.get("my_public_key")
        };

        const response = await this.request.get(
            `${pm.environment.get("adminconsole")}/api/r1/community/${pm.environment.get("client_community_name")}/userid/${username}/userinfo?devicelist=true`,
            { headers }
        );
        let jsonData;
        try {
            // Try to decrypt the data
            jsonData = await utils.decryptDataWithEnvKeys(await response.json().data, pm.collectionVariables.get("servicePublicKey"));
            console.log("Decryption successful");
        } catch (error) {
            // If decryption fails, use the original response
            console.log("Decryption failed:", error.message);
            console.log("Using original response data instead");
            jsonData = pm.response.json();
        }
        // this.prettyPrint(jsonData);


        return jsonData;
    };

    utils.getDevicesAll = async function getDevicesAll(username) {
        const tag = pm.environment.get("client_tenant_tag");
        let url = `${pm.environment.get("adminconsole")}/api/r1/community/${pm.environment.get("client_community_name")}`
        const servicePublicKey = await this.fetchServicePublicKey(url, tag);
        pm.collectionVariables.set("servicePublicKey", servicePublicKey);

        const [enc_request_id, enc_license_key] = await Promise.all([
            this.encryptDataWithEnvKeys(JSON.stringify(this.generateRequestId()), servicePublicKey),
            this.encryptDataWithEnvKeys(pm.environment.get("client_license"), servicePublicKey)
        ]);

        const headers = {
            'Content-Type': 'application/json',
            'X-TenantTag': tag,
            requestid: enc_request_id,
            licensekey: enc_license_key,
            publickey: pm.environment.get("my_public_key")
        };

        const response = await this.request.get(
            `${pm.environment.get("adminconsole")}/api/r1/community/${pm.environment.get("client_community_name")}/userid/${username}/details?devicelist=true`,
            { headers }
        );
        let jsonData;
        try {
            // Try to decrypt the data
            jsonData = await utils.decryptDataWithEnvKeys(await response.json().data, pm.collectionVariables.get("servicePublicKey"));
            console.log("Decryption successful");
        } catch (error) {
            // If decryption fails, use the original response
            console.log("Decryption failed:", error.message);
            console.log("Using original response data instead");
            jsonData = pm.response.json();
        }
        return jsonData;
    };

    utils.createAndAuthorizeNewLicense = async function createAndAuthorizeNewLicense(
        authLevel,
        skipAuto = false,
        scope = "environment"
    ) {
        const store = scope === "collection" ? pm.collectionVariables : pm.environment;

        //  Fetch service public key
        const servicePublicKey = await utils.fetchServicePublicKey(pm.environment.get("licenses"));

        // Generate random tag, keyId, and keySecret
        const tag = `tag_${Math.random().toString(36).substring(7)}_${authLevel}`;
        const keyId = pm.variables.replaceIn('{{$guid}}');
        const keySecret = pm.variables.replaceIn('{{$guid}}');
        console.log("Generated keySecret:", keySecret);

        // Store current license info
        store.set("currentLicense", keySecret);
        store.set("currentLicenseTag", tag);

        // Set expiry date 2 years in the future
        const currentDate = new Date();
        currentDate.setFullYear(currentDate.getFullYear() + 2);
        const formattedDate = currentDate.toISOString();

        // License creation payload
        let payload = {
            tag: tag,
            keyId: keyId,
            keySecret: keySecret,
            description: `${authLevel} license key for Postman testing`,
            disabled: false,
            expiry: formattedDate,
            authLevel: authLevel,
            modules: {}
        };

        // Encrypt requestId and license key
        const [enc_request_id, enc_license_key] = await Promise.all([
            utils.encryptDataWithEnvKeys(JSON.stringify(utils.generateRequestId()), servicePublicKey),
            utils.encryptDataWithEnvKeys(pm.environment.get("client_license"), servicePublicKey)
        ]);

        utils.setVars({
            enc_request_id,
            enc_license_key
        });

        // Create new license key
        const responseKey = await utils.request.put(
            `${pm.environment.get("licenses")}/servicekey`,
            {
                headers: {
                    publickey: pm.environment.get("my_public_key"),
                    requestid: enc_request_id,
                    licensekey: enc_license_key,
                    "Content-Type": "application/json"
                },
                data: payload
            }
        );

        if (responseKey.status() !== 200) {
            throw new Error(`Failed create new ${authLevel} key. Status: ${responseKey.status()}`);
        }

        const responseKeyJson = responseKey.json();
        store.set("currentLicenseId", responseKeyJson.keyId);

        // Skip auto-authorization if skipAuto is true
        if (skipAuto) {
            return responseKeyJson.keySecret;
        }

        // Authorize the new license
        let authPayload = {
            keyTag: tag,
            communityId: pm.environment.get("communityId"),
            communityName: pm.environment.get("client_community_name"),
            isAuthorized: true,
            expiry: formattedDate
        };

        const responseAuth = await utils.request.put(
            `${pm.environment.get("licenses")}/community/servicekey`,
            {
                headers: {
                    publickey: pm.environment.get("my_public_key"),
                    requestid: enc_request_id,
                    licensekey: enc_license_key,
                    "Content-Type": "application/json"
                },
                data: authPayload
            }
        );

        if (responseAuth.status() !== 200) {
            throw new Error(`Failed authorize ${authLevel} key. Status: ${responseAuth.status()}`);
        }

        return responseKeyJson.keySecret;
    };

    utils.createAndAuthorizeInvalidLicense = async function createAndAuthorizeInvalidLicense(
        authLevel,
        disabled = false,
        expired = false,
        scope = "environment"
    ) {
        const store = scope === "collection" ? pm.collectionVariables : pm.environment;

        //  Fetch service public key
        const servicePublicKey = await utils.fetchServicePublicKey(pm.environment.get("licenses"));

        //  Generate tag, keyId, keySecret
        const tag = `tag_${Math.random().toString(36).substring(7)}_${authLevel}`;
        const keyId = pm.variables.replaceIn("{{$guid}}");
        const keySecret = pm.variables.replaceIn("{{$guid}}");

        console.log("keySecret:", keySecret);

        //  Save to Postman variables
        store.set("currentLicense", keySecret);
        store.set("currentLicenseTag", tag);

        //  First payload: license creation
        const createPayload = {
            tag: tag,
            keyId: keyId,
            keySecret: keySecret,
            description: `${authLevel} license key for Postman testing`,
            disabled: disabled, // passed directly
            expiry: new Date().toISOString(), // creation time
            authLevel: authLevel,
            modules: {}
        };

        //  Encrypt requestId and license key
        const [enc_request_id, enc_license_key] = await Promise.all([
            utils.encryptDataWithEnvKeys(JSON.stringify(utils.generateRequestId()), servicePublicKey),
            utils.encryptDataWithEnvKeys(pm.environment.get("client_license"), servicePublicKey)
        ]);

        utils.setVars({
            enc_request_id,
            enc_license_key
        });

        // Create the license
        const responseKey = await utils.request.put(`${pm.environment.get("licenses")}/servicekey`, {
            headers: {
                publickey: pm.environment.get("my_public_key"),
                requestid: enc_request_id,
                licensekey: enc_license_key,
                "Content-Type": "application/json"
            },
            data: createPayload
        });

        if (responseKey.status() !== 200) {
            throw new Error(`❌ Failed to create ${authLevel} key. Status: ${responseKey.status()}`);
        }

        const responseKeyJson = responseKey.json();
        store.set("currentLicenseId", responseKeyJson.keyId);

        //  Determine expiry date based on `expired` flag
        let formattedExpiry;
        if (expired) {
            // Expired → 1 year in the past
            const pastDate = new Date();
            pastDate.setFullYear(pastDate.getFullYear() - 1);
            formattedExpiry = pastDate.toISOString();
        } else {
            // Not expired → 1 year in the future ✅
            const futureDate = new Date();
            futureDate.setFullYear(futureDate.getFullYear() + 1);
            formattedExpiry = futureDate.toISOString();
        }

        //  Second payload: authorize license
        const authPayload = {
            keyTag: tag,
            communityId: pm.environment.get("communityId"),
            communityName: pm.environment.get("client_community_name"),
            isAuthorized: true,
            expiry: formattedExpiry
        };

        const responseAuth = await utils.request.put(
            `${pm.environment.get("licenses")}/community/servicekey`,
            {
                headers: {
                    publickey: pm.environment.get("my_public_key"),
                    requestid: enc_request_id,
                    licensekey: enc_license_key,
                    "Content-Type": "application/json"
                },
                data: authPayload
            }
        );

        if (responseAuth.status() !== 200) {
            throw new Error(`❌ Failed to authorize ${authLevel} key. Status: ${responseAuth.status()}`);
        }

        console.log(`✅ Created ${disabled ? "disabled" : "enabled"} ${expired ? "expired" : "valid"} license`);
        return responseKeyJson.keySecret;
    };


    utils.deauthorizeAndDeleteLicense = async function deauthorizeAndDeleteLicense(tag, keyId, skipAuto = false, url=pm.request.url.toString()) {
        console.log("TEST URL (before decrypt): ", url);
        const servicePublicKey = await utils.fetchServicePublicKey(pm.environment.get("licenses"));
        const [enc_request_id, enc_license_key] = await Promise.all([
            utils.encryptDataWithEnvKeys(JSON.stringify(utils.generateRequestId()), servicePublicKey),
            utils.encryptDataWithEnvKeys(pm.environment.get("client_license"), servicePublicKey)
        ]);

        utils.setVars({
            enc_request_id,
            enc_license_key
        });
        if (!skipAuto) {
            const deleteAuth = await utils.request.delete(
                `${pm.environment.get("licenses")}/community/${pm.environment.get("communityId")}/servicekey/${tag}`,
                {
                    headers: {
                        "publickey": pm.environment.get("my_public_key"),
                        "requestid": enc_request_id,
                        "licensekey": enc_license_key,
                        "Content-Type": "application/json"
                    },
                }
            );
            if (deleteAuth.status() !== 204) {
                throw new Error(`Failed deauthorize key. Status: ${deleteAuth.status()}`);
            }
        }

        const deleteKey = await utils.request.delete(
            `${pm.environment.get("licenses")}/servicekey?keyId=${keyId}`,
            {
                headers: {
                    "publickey": pm.environment.get("my_public_key"),
                    "requestid": enc_request_id,
                    "licensekey": enc_license_key,
                    "Content-Type": "application/json"
                },
            }
        );
        if (deleteKey.status() !== 204) {
            throw new Error(`Failed deauthorize key. Status: ${deleteKey.status()}`);
        }


    }

    utils.fetchServiceKeyPair = async function fetchServiceKeyPair(apiUrl, tag) {
        try {
            const servicePublicKey = await utils.fetchServicePublicKey(apiUrl)
            const [enc_request_id, enc_license_key] = await Promise.all([
                utils.encryptDataWithEnvKeys(JSON.stringify(utils.generateRequestId()), servicePublicKey),
                utils.encryptDataWithEnvKeys(pm.environment.get("sys_license"), servicePublicKey)
            ]);

            utils.setVars({
                enc_request_id,
                enc_license_key
            });
            const headers = {
                "Content-Type": "application/json",
                "publickey": pm.environment.get("my_public_key"),
                "requestid": enc_request_id,
                "licensekey": enc_license_key
            };
            if (tag) {
                headers["X-TenantTag"] = tag;
            }
            const response = await utils.request.get(
                `${apiUrl}/servicekeys`,
                { headers: headers }
            );

            if (response.status() !== 200) {
                throw new Error(`Failed to fetch server public key: ${response.status()}`);
            }

            jsonData = await utils.decryptDataWithEnvKeys(response.json().data, servicePublicKey);
            let ecdsaItem = jsonData.find(item => item.type === "ecdsa");
            if (ecdsaItem) {
                return ecdsaItem.keySecret
            } else {
                throw new Error("ECDSA key not found");
            }
        } catch (error) {
            console.error("Error fetching server public key:", error);
            throw error;
        }
    };

    utils.checkSkipMode = function checkSkipMode(skipCondition = false, reason = "Manual skip") {
        const skipMode = skipCondition;
        pm.collectionVariables.set("skipMode", skipMode);

        if (skipMode) {
            console.log(`⏹ Skipping request: ${reason}`);
            // pm.execution.setNextRequest(null);
            return true;
        }

        console.log("✅ Request will be executed");
        return false;
    };

    utils.handleSkipMode = function handleSkipMode(skipTests = true) {
        const skipMode = pm.collectionVariables.get("skipMode");

        if (skipMode) {
            if (skipTests) {
                console.log("⏭ Skipping tests because request was skipped");
            } else {
                console.log("⏭ Request was skipped but continuing with tests");
            }
            return true;
        }

        return false;
    };

    utils.checkLicense = async function checkLicense(license) {
        const servicePublicKey = await utils.fetchServicePublicKey(pm.environment.get("licenses"));
        const [enc_request_id, enc_license_key] = await Promise.all([
            utils.encryptDataWithEnvKeys(JSON.stringify(utils.generateRequestId()), servicePublicKey),
            utils.encryptDataWithEnvKeys(license, servicePublicKey)
        ]);

        utils.setVars({
            enc_request_id,
            enc_license_key
        });

        const response = await this.request.get(
            `${pm.environment.get("licenses")}/community/${pm.environment.get("communityId")}/licensecheck`,
            {
                headers: {
                    "publickey": pm.environment.get("my_public_key"),
                    "requestid": enc_request_id,
                    "licensekey": enc_license_key,
                    "Content-Type": "application/json"
                }

            }
        );
        if (response.status() === 200) {
            const body = response.json();
            return { isValid: true, authLevel: body.authLevel };
        }
        // return { isValid: false, authLevel: null };
        return false;
    };

    utils.randomCase = function randomCase(str) {
        return str
            .split('')
            .map(char => Math.random() > 0.5 ? char.toUpperCase() : char.toLowerCase())
            .join('');
    };

    utils.loadCryptoLibrary = function loadCryptoLibrary() {
        // 1. Определяем полифилы (можно хранить их тут же или вынести в отдельные переменные)
        const setupCrypto = `(function(){var g=(function(){return this;})()||(typeof global!=='undefined'?global:typeof window!=='undefined'?window:{});var isNewman=typeof require==='function';if(!g.crypto)g.crypto={};g.crypto._isNewman=isNewman;if(isNewman){try{g.crypto._nodeCrypto=typeof require==='function'?require('crypto'):null;}catch(e){}}})();`;

        const randomValuesPolyfill = `(function(){var __g=(function(){return this;})()||(typeof global!=='undefined'?global:typeof window!=='undefined'?window:{});if(!__g.crypto)__g.crypto.getRandomValues=function(buf){if(typeof pm!=="undefined"&&pm.crypto&&typeof pm.crypto.getRandomBytes==="function"){var bytes=pm.crypto.getRandomBytes(buf.length);for(var i=0;i<buf.length;i++)buf[i]=bytes[i];return buf;}if(typeof pm!=="undefined"&&typeof pm.require==="function"){try{var nodeCrypto=pm.require("crypto");var bytes=nodeCrypto.randomBytes(buf.length);for(var i=0;i<buf.length;i++)buf[i]=bytes[i];return buf;}catch(_){}}for(var i=0;i<buf.length;i++)buf[i]=Math.floor(Math.random()*256);return buf;};}})();`;

        const btoaPolyfill = `var atob=atob||function(e){for(var t,r,i,f,d,n,a="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",c="",s=0,h=e.replace(/[^A-Za-z0-9\\+\\/\\=]/g,"");s<h.length;)t=a.indexOf(h.charAt(s++))<<2|(f=a.indexOf(h.charAt(s++)))>>4,r=(15&f)<<4|(d=a.indexOf(h.charAt(s++)))>>2,i=(3&d)<<6|(n=a.indexOf(h.charAt(s++))),c+=String.fromCharCode(t),64!==d&&(c+=String.fromCharCode(r)),64!==n&&(c+=String.fromCharCode(i));return c};var btoa=btoa||function(e){for(var t,r,i,f,d,n,a,c="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",s="",h=0;h<e.length;)f=(t=e.charCodeAt(h++))>>2,d=(3&t)<<4|(r=e.charCodeAt(h++))>>4,n=(15&r)<<2|(i=e.charCodeAt(h++))>>6,a=63&i,isNaN(r)?n=a=64:isNaN(i)&&(a=64),s+=c.charAt(f)+c.charAt(d)+c.charAt(n)+c.charAt(a);return s};`;

        const textEncoderPolyfill = `(function(){var g=(function(){return this;})()||(typeof global!=='undefined'?global:typeof window!=='undefined'?window:{});if(typeof g.TextEncoder==="undefined"){g.TextEncoder=class{encode(str){var BufferClass=typeof Buffer!=="undefined"?Buffer:null;if(!BufferClass&&typeof require==="function"){try{BufferClass=require("buffer").Buffer;}catch(e){}}if(BufferClass)return new Uint8Array(BufferClass.from(str,"utf-8"));var utf8=unescape(encodeURIComponent(str));var arr=new Uint8Array(utf8.length);for(var i=0;i<utf8.length;i++)arr[i]=utf8.charCodeAt(i);return arr;}};}if(typeof g.TextDecoder==="undefined"){g.TextDecoder=class{decode(bytes){var BufferClass=typeof Buffer!=="undefined"?Buffer:null;if(!BufferClass&&typeof require==="function"){try{BufferClass=require("buffer").Buffer;}catch(e){}}if(BufferClass)return BufferClass.from(bytes).toString("utf-8");var str="";for(var i=0;i<bytes.length;i++)str+=String.fromCharCode(bytes[i]);try{return decodeURIComponent(escape(str));}catch(e){return str;}}};}})();`;


        // 2. Ищем зависимости
        let cryptoJsLib = null;
        if (typeof require !== 'undefined') { try { cryptoJsLib = require('crypto-js'); } catch (e) { } }
        if (!cryptoJsLib && typeof CryptoJS !== 'undefined') { cryptoJsLib = CryptoJS; }

        // 3. Получаем код библиотеки
        let source = pm.globals.get("postmanCrypto");
        if (!source) throw new Error("Global variable 'postmanCrypto' is missing");

        // 4. Склеиваем
        const fullSource = setupCrypto + "\n" + randomValuesPolyfill + "\n" + btoaPolyfill + "\n" + textEncoderPolyfill + "\n" + source;

        // 5. Инициализируем
        const moduleShim = { exports: {} };
        const bundleRequire = typeof require !== 'undefined' ? require : function () { throw new Error('require not available'); };

        // Важный момент: передаем cryptoJsLib как _cryptoJS
        const loader = new Function("module", "exports", "require", "pm", "_cryptoJS", fullSource);

        try {
            loader(moduleShim, moduleShim.exports, bundleRequire, pm, cryptoJsLib);
        } catch (e) {
            console.error('[Utils] Crypto Bundle loading failed:', e);
            throw e;
        }

        return moduleShim.exports;
    };

    utils.fetchCommunitySecrets = async function fetchCommunitySecrets(
    tag = null,
    communityId = pm.environment.get("communityId")
) {
    try {
        const url = pm.environment.get("client_api");

        const endpoint = `/caas/tenants/${pm.environment.get("tenantId")}/community/${communityId}/secrets/fetch`;

        // Ensure service public key is available
        const servicePublicKey = await this.fetchServicePublicKey(url + "/caas/publickeys");

        // Prepare request ID
        const requestId = this.generateRequestId();

        // Encrypt request ID
        const encRequestId = await this.encryptDataWithEnvKeys(JSON.stringify(requestId), servicePublicKey);

        // Encrypt license key
        const encLicenseKey = await this.encryptDataWithEnvKeys(pm.environment.get("client_license"), servicePublicKey);

        const payload = {
            tags: tag ? [tag] : [],
        };

        // Make fetch secrets request
        const response = await this.request.post(
            `${url}${endpoint}`,
            {
                headers: {
                    "Content-Type": "application/json",
                    publickey: pm.environment.get("my_public_key"),
                    requestid: encRequestId,
                    licensekey: encLicenseKey,
                },
                data: payload,
            }
        );

        if (response.status() !== 200) {
            throw new Error(`Fetch secrets request failed with status ${response.status()}: ${await response.json()}`);
        }

        const responseData = response.json();
        console.log(`Secrets for tag '${tag}': ${JSON.stringify(responseData)}`);
        return responseData.secrets;

    } catch (error) {
        console.error(`Error during fetching secrets for tag '${tag}':`, error);
        throw error;
    }
};


    utils.createWalletForEncryptDecrypt = function createWalletForEncryptDecrypt() {
        const PostmanCrypto = this.loadCryptoLibrary();
        let wallet = PostmanCrypto.createWallet();
        pm.globals.set("wallet", JSON.stringify(wallet));
        console.log("wallet: ", JSON.stringify(wallet))

        pm.globals.set("wallet_did", wallet.did);
        pm.globals.set("public_key", wallet.publicKey);
        pm.globals.set("private_key", wallet.privateKey);
        return wallet.privateKey
    };

    utils.createAndEncryptNonce = async function createAndEncryptNonce(authnPublicKey, mobilePrivateKey,customUuid = null, customTs = null) {
        const CryptoJS = require('crypto-js');

        const uuid = customUuid || pm.variables.replaceIn('{{$guid}}');
        const ts = customTs || Math.floor(Date.now() / 1000)

        const nonceData = {
            uuid: uuid,
            ts: ts }


        const nonce = CryptoJS.enc.Base64.stringify(
            CryptoJS.enc.Utf8.parse(JSON.stringify(nonceData))
        );

        const nonce_signature = await utils.encryptDataWithEnvKeys(nonce, authnPublicKey, mobilePrivateKey);

        return {
            nonce: nonce,
            nonce_signature: nonce_signature,
            uuid : uuid,
            ts: ts
        };
    };

    return utils;
} + '; testUtils();');
