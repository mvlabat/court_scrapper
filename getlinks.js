const request = require('request');
const fs = require('fs');

const kue = require('kue'),
  queue = kue.createQueue();

// Init post parameters.
var court_type = 5;
const last_court_type = 8;
var reg_id = 1;
// Init concurrency parameters.
const WORKERS = 10;
var last_failed_count = 0;
var links = {};

// Job processor.
queue.process('links', WORKERS, function(job, done) {
  console.log('processing ' + job.id + '...');
  request.post({
    headers: {'content-type' : 'application/x-www-form-urlencoded'},
    url: 'http://court.gov.ua/sudy/',
    body: 'court_type=' + job.data.court_type + '&reg_id=' + job.data.reg_id
  }, function(error, response, body) {

    console.log(response.statusCode);
    if (response.statusCode == 302 && response.headers.location.length > 0) {
      console.log(response.statusCode + ': ' + response.headers.location);
      links[job.data.court_type][job.data.reg_id] = response.headers.location;
      done(null, job.data.court_type);
    }
    else {
      done(new Error(job.data.court_type));
    }

  });
});

function create_job() {
  var job = queue.create('links', { court_type: court_type, reg_id: reg_id });

  job.on('complete', function(result) {

    console.log('Job completed. court_type: ', result);
    create_job();

  }).on('failed', function(result) {

    console.log('Job failed (' + last_failed_count + '\'th time). court_type: ', result);
    console.log('Current court_type: ' + court_type);
    if (result == court_type)
      last_failed_count++;

    if (last_failed_count < WORKERS) {
      // For the case if some reg_ids are missed on the site. Create new jobs until all the workers fail.
      create_job();
    }
    else {
      if (court_type < last_court_type) {
        // Proceed to the next court type.
        last_failed_count = 0;
        court_type++;
        reg_id = 1;
        create_job();
      }
      else if (last_failed_count == WORKERS) {
        // All the courts are processed, write links and exit.
        fs.writeFileSync("links.json", JSON.stringify(links, null, 4));
        process.exit();
      }
    }

  }).removeOnComplete(true).save();

  // Increment reg_id for the next created job.
  reg_id++;
}

// Initialize initial jobs.
for (var i = court_type; i <= last_court_type; ++i) {
  links[i] = {};
}
for (var i = 0; i < WORKERS; ++i) {
  create_job();
}
