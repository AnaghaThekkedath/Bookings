const fs = require('fs');
const readline = require('readline');
const {google} = require('googleapis');
const config = require('./config.json');
const slots = [ "9:0","9:45","10:30","11:15","12:0","12:45","13:30","14:15","15:0","15:45","16:30","17:15" ]
const SCOPES =["https://www.googleapis.com/auth/calendar"]
/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials) {
    const {client_secret, client_id, redirect_uris} = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
        client_id, client_secret, redirect_uris[0]);

    return new Promise((reject, resolve) => {
    // Check if we have previously stored a token.
        fs.readFile(config.tokenPath, (err, token) => {
        if (err) return getAccessToken(oAuth2Client).then(reject,resolve);
        oAuth2Client.setCredentials(JSON.parse(token));
        resolve(oAuth2Client);
        });                                                                         
    });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getAccessToken(oAuth2Client) {
    const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    });
    return new Promise((reject,resolve)=>{
        console.log('Authorize this app by visiting this url:', authUrl);
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        rl.question('Enter the code from that page here: ', (code) => {
            rl.close();
            oAuth2Client.getToken(code, (err, token) => {
            if (err) reject('Error retrieving access token'+err);
            oAuth2Client.setCredentials(token);
            // Store the token to disk for later program executions
            fs.writeFile(config.tokenPath, JSON.stringify(token), (err) => {
                if (err) reject(err);
                console.log('Token stored to', config.tokenPath);
            });
            resolve(oAuth2Client);
            });
        });
    });
}

function filterEvents(events){
    let result = {};
    events.forEach(event => {
        if(event.day !== 0 && event.day !== 6 &&
            event.startHour >=9 && event.startHour < 18) {
            if (result[event.date] == undefined){
                result[event.date] = {
                    workDay: true,
                    appointments: {}
                }
            }
            let key = String(event.hours) +':'+ String(event.minutes); 
            result[event.date].appointments[key] = true;
        }
    });
    return result;
}



module.exports = {
    /**
     * Gets Auth from file or makes a call for it.
     */
    getAuth:()=>{
        // Load client secrets from a local file.
        return new Promise((reject,resolve)=>{
            fs.readFile('credentials.json', (err, content) => {
            if (err) reject(err);
            // Authorize a client with credentials, then call the Google Calendar API.
            authorize(JSON.parse(content)).then(reject,resolve);
            });
        });
    },

    /**
     * Lists the next 10 events on the user's primary calendar.
     * @param {google.auth.OAuth2, StartDate, EndDate} auth An authorized OAuth2 client.
     */
    listEvents:(auth, timeMin, timeMax)=>{
        const calendar = google.calendar({version: 'v3'}, auth);
        const result = [];
        return new Promise((reject,resolve)=>{
            calendar.events.list({
                auth,
                calendarId: config.calendarId,
                timeMin,
                timeMax,
                singleEvents: true,
                orderBy: 'startTime',
            }, (err, res) => {
            if (err) {
                reject(err);
                return;
            }
            const events = res.data.items;
            if (events.length) {
                events.map((event, i) => {
                    const start = event.start.dateTime || event.start.date,
                        end = event.end.dateTime || event.end.date;
                    let startDate = new Date(start),
                        r = {
                        day: startDate.getDay(),
                        date: startDate.getDate(),
                        hours: startDate.getHours(),
                        minutes: startDate.getMinutes(),
                        startHour:startDate.getHours(),
                        summary: event.summary,
                        start,
                        end,
                    };
                    result.push(r);
                });
                resolve(filterEvents(result));
            } else {
                console.log('No upcoming events found.');
                resolve([]);
            }
            });
        });
    },

    parseForDay:(events, year, month, date) => {
        let booked = events[date],
            availableSlots = [],
            day = (new Date(year,month-1,date)).getDay();
        if(day===0||day===6) return availableSlots;
        slots.forEach(slot => {
            if (!booked || !booked.appointments || !booked.appointments[slot]){  
                let temp = slot.split(":"),
                    hours = parseInt(temp[0]),
                    minutes = parseInt(temp[1]),
                    as = {
                        startTime:(new Date(year, month-1, date, hours, minutes)).toISOString(),
                        endTime:(new Date(year, month-1, date, hours+((minutes+40)/60), (minutes+40)%60)).toISOString(),
                    };         
                availableSlots.push(as)
            }
        });
        return availableSlots;
    },

    parseForMonth:(events, year, month) => {
        let numberOfDays = (new Date(year, month, 0)).getDate(),
            result = [];
        
        for (let i=1; i<=numberOfDays; i++){
            let day = (new Date(year, month, i)).getDay(),
                r = {
                    day: i,
                    hasTimeSlots: day !== 0 && day !== 6,
                },
                booked = events[i],
                free = 0;
                for (let j=0; j<slots.length; j++){
                    if(!booked || !booked.appointments || !booked.appointments[slots[j]]) {
                        free = 1;
                        break;
                    }
                }
                if(free === 0) r.hasTimeSlots = false;
            result.push(r);
        }
        return result;
    },

    addEvents:(auth, startTime, endTime) => {
        const calendar = google.calendar({version: 'v3'}, auth);
            event = {
                summary: 'Appointment',
                start: {
                    dateTime: startTime,
                    timeZone: 'Australia/Sydney',
                },
                end: {
                    dateTime: endTime,
                    timeZone: 'Australia/Sydney',
                },                                                                          
            };
        return new Promise((reject, resolve)=>{
            calendar.events.insert({
                auth,
                calendarId: config.calendarId,
                resource: event,
              }, function(err, event) {
                if (err) {
                  reject('There was an error contacting the Calendar service: ' + err);
                  return;
                }
                resolve({startTime, endTime});
              });
        })
    },

    checkValidSlot: (hours,minutes)=>{
        let slot = hours+":"+minutes;
        return slots.findIndex(slot) !=-1;
    }
};