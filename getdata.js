var request = require('request');
var fs = require('fs');
var cheerio = require('cheerio');
var iconv = require('iconv');

var kue = require('kue'),
  queue = kue.createQueue();

// Init concurrency parameters.
const WORKERS = 10;
var results = [];

// Read the gathered links.
var links = fs.readFileSync('links.txt').toString().split('\n');
// Get rid of the last empty element.
links.pop();

// Job processor.
queue.process('data', WORKERS, function(job, done) {
  request({
    uri: job.data,
    method: 'GET',
    encoding: 'binary'
  }, function(error, response, body) {

    if (error || response.statusCode != 200) {
      done(new Error(error));
      return;
    }

    // Convert body to UTF-8.
    body = new Buffer(body, 'binary');
    var conv = new iconv.Iconv('windows-1251', 'utf8');
    body = conv.convert(body).toString();
    // Initialize creerio and data objects.
    var $ = cheerio.load(body);
    var data = { name: null, link: job.data, address: null, phone: null, email:null };

    var name = $('div#main');
    // Some documents have broken DOMs, they usually contain no useful data and are difficult to parse.
    if (name.length > 1) {
      done( { error: new Error('invalid DOM (АР Крим, можливо)'), data: data });
      return;
    }
    data.name = name.text();

    var menu = $('.menur1');
    var d2_data = menu.find('.b2');
    data.address = d2_data.first().text();
    // Some phone strings have many redundant spaces, separating fax.
    data.phone = menu.find('.b3').first().text().replace(/ +(?= )/g, '');
    d2_data.each(function(i, elem) {
      var text = $(this).text();
      if (text.indexOf('@') > -1) {
        data.email = text;
        return false;
      }
    });

    done(null, data);

  });
});

function create_job(i) {
  var job = queue.create('data', links[i]).save(function(err) {
    //if( !err ) console.log( job.id );
  });

  job.on('complete', function(result) {

    //console.log(result);
    results.push(result);

    if (i == links.length - 1) {
      save_results();
    }

  }).on('failed', function(result) {

    if (result.hasOwnProperty('msg')) {
      //console.log('Error "' + result.msg + '" for ' + job.data);
      results.push(result.data);
    }
    else {
      console.log('Error "' + result.message + '" for ' + job.data);
    }

    if (i == links.length - 1) {
      save_results();
    }

  });
}

function save_results() {
  fs.writeFileSync("data.json", JSON.stringify(results, null, 4));
  process.exit();
}

for (var i = 0; i < links.length; ++i) {
  if (isNaN(links[i])) {
    create_job(i);
  }
}
