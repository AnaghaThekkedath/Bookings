const googleapi = require('./google_api'),
    express = require('express'),
    app = express();

app.get('/days',(req,res) => {
    const year = req.query.year,
          month = req.query.month,
          today = new Date(year, month-1),
          nextMonth = new Date(year, month);

          googleapi.getAuth().then(
                (err)=>{
                    console.log(err);
                    res.status(401).send(err);
                },
                (auth)=>googleapi.listEvents(auth, today.toISOString(), nextMonth.toISOString()))
            .then(
                (err)=>{
                    console.error(err);
                    res.status(500).send(err);
                },
                (result) => {
                    const obj = googleapi.parseForMonth(result, year, month);
                    console.log(obj);
                    res.status(200).json({success:true,days:obj});
                }              
          );
});

app.get('/timeslots',(req,res) => {
    const year = req.query.year,
          month = req.query.month,
          day = req.query.day,
          today = new Date(year, month-1, day),
          tomorrow = new Date(year, month-1, day+1);

          googleapi.getAuth()
          .then(
                (err)=>{
                    console.log(err);
                    res.status(401).send(err);
                },
                (auth)=>googleapi.listEvents(auth, today.toISOString(), tomorrow.toISOString()),
                ) 
          .then(
                (err)=>{
                    console.error(err);
                    res.status(500).send(err);
                },
                (result) => {
                    const obj = googleapi.parseForDay(result, year, month, day);
                    console.log(obj);
                    res.status(200).json({success:true, timeslots:obj });
                }              
          );
});

app.post('/book',(req,res)=>{
    const year = parseInt(req.query.year),
          month = parseInt(req.query.month),
          day = parseInt(req.query.day),
          hour = parseInt(req.query.hour),
          minute = parseInt(req.query.minute),
          today = new Date(),
          book_day = new Date(year, month-1, day, hour, minute),
          week_day = book_day.getDay();
    
    if(week_day === 0 || week_day === 6 ||
        hour<9 || hour >=18 ){
            res.status(400).json({success:false, message: 'Cannot book outside bookable timeframe'});
            return;
        }
    
    if (today.getDate() == day || (today.getDate()+1 == day && (today.getHours()-hour<24))){
        res.status(400).json({success:false, message: 'Cannot book with less than 24 hours in advance'});
        return;
    }
    
    if(book_day<today){
        res.status(400).json({success:false, message: 'Cannot book time in the past'});
        return;
    }
    if(!googleapi.checkValidSlot(hour,minute)){
        res.status(400).json({success:false, message: 'Cannot book time in the past'});
        return;
    }
    let endTime = new Date(year, month-1, day, hour+((minute+40)/60), (minute+40)%60);

    googleapi.getAuth()
          .then(
                (err)=>{
                    console.log(err);
                    res.status(401).send(err);
                },
                (auth)=>googleapi.addEvents(auth, book_day.toISOString(), endTime.toISOString()),
                ) 
          .then(
                (err)=>{
                    console.error(err);
                    res.status(500).send(err);
                },
                (result) => {
                    console.log(result);
                    res.status(200).json({success:true, startTime:result.startTime, endTime: result.endTime });
                }              
          );
    
});


const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}...`);
});




