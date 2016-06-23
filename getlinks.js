var request = require('request');
var fs = require('fs');

var kue = require('kue'),
  queue = kue.createQueue();

// Init post parameters.
var court_type = 5;
var reg_id = 1;
// Init concurrency parameters.
const WORKERS = 10;
var last_failed_count = 0;
var links_stream = fs.createWriteStream('links.txt');

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
      links_stream.write(response.headers.location + '\n');
      done(null, job.data.court_type);
    }
    else {
      done(new Error(job.data.court_type));
    }

  });
});

function create_job() {
  var job = queue.create('links', { court_type: court_type, reg_id: reg_id }).save(function(err) {
    //if( !err ) console.log( job.id );
  });

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
      if (court_type < 8) {
        // Proceed to the next court type.
        last_failed_count = 0;
        court_type++;
        reg_id = 1;
        links_stream.write(court_type + '\n');
        create_job();
      }
      else if (last_failed_count == WORKERS) {
        // All the courts are processed, end file stream and exit.
        links_stream.end();
        process.exit();
      }
    }

  });

  // Increment reg_id for the next created job.
  reg_id++;
}

// Initialize initial jobs.
links_stream.write(court_type + '\n');
for (var i = 0; i < WORKERS; ++i) {
  create_job();
}
