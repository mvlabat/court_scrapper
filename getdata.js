const start_time = Date.now();
const request = require('request');
const fs = require('fs');
const cheerio = require('cheerio');
const iconv = require('iconv');

const kue = require('kue'),
  queue = kue.createQueue();

// Init concurrency parameters.
const WORKERS = 16;
var results = {};

function Notices() {
  var errors = [];
  var warnings = [];

  this.add_error = function(id, error_text) {
    if (!errors.hasOwnProperty(id)) {
      errors[id] = [];
    }
    errors[id].push(error_text);
  };

  this.add_warning = function(id, warning_text) {
    if (!warnings.hasOwnProperty(id)) {
      warnings[id] = [];
    }
    warnings[id].push(warning_text);
  };

  /**
   * Copies and returns all the errors and warnings.
   */
  this.get_data = function() {
    var data = { errors: {}, warnings: {} };
    // Converting arrays into objects for JSON compatibility.
    for (id in errors) {
      var errors_list = {};
      for (i in errors[id]) {
        errors_list[i] = errors[id][i];
      }
      data.errors[id] = errors_list;
    }
    for (id in warnings) {
      var warnings_list = {};
      for (i in warnings[id]) {
        warnings[i] = warnings[id][i];
      }
      data.warnings[id] = warnings_list;
    }
    return data;
  }
}
var notices = new Notices();

// Read the gathered links.
const reg_ids = JSON.parse(fs.readFileSync('regions.json', 'utf8'));
const links = JSON.parse(fs.readFileSync('links.json', 'utf8'));

function parse_court($, args) {
  var data = {
    id: args.id,
    region: args.region_name,
    link: args.link,
    name: null,
    address: null,
    phone: null,
    email: null,
    timetable: null
  };

  var contacts_data;

  function parse_name() {
    var name = $('div#main');
    // Some documents have broken DOMs, they usually contain no useful data and are difficult to parse.
    if (name.length > 1) {
      data.error = 'invalid DOM (АР Крим, можливо)';
      return false;
    }
    data.name = name.text();
    return true;
  }

  function gather_contacts_data() {
    contacts_data = $('.menur1 .b2');
    return true;
  }

  function parse_address() {
    data.address = contacts_data.first().text();
    return true;
  }

  function parse_phone() {
    // Some phone strings have many redundant spaces, separating fax.
    data.phone = $('.menur1 .b3').first().text().replace(/ +(?= )/g, '');
    return true;
  }

  function parse_email() {
    contacts_data.each(function(i, elem) {
      var text = $(this).text();
      if (text.indexOf('@') > -1) {
        data.email = text;
        return false;
      }
    });
    return true;
  }

  function parse_timetable() {
    data.timetable = $('.menur2').first().text();
    return true;
  }

  parse_name() &&
  gather_contacts_data() &&
  parse_address() &&
  parse_phone() &&
  parse_email() &&
  parse_timetable();

  return data;

}

function parse_judges() {

}

function to_utf8(body) {
  body = new Buffer(body, 'binary');
  var conv = new iconv.Iconv('windows-1251', 'utf8');
  body = conv.convert(body).toString();
  return body;
}

// Job processor.
queue.process('data', WORKERS, function(job, done) {
  request({
    uri: job.data.link,
    method: 'GET',
    encoding: 'binary'
  }, function(error, response, body) {

    if (error || response.statusCode != 200) {
      done(null, { id: job.data.id, link: job.data.link, region: job.data.region_name, error: error } );
      return;
    }

    const data = parse_court(cheerio.load(to_utf8(body)), job.data);

    if (data.error) {
      notices.add_error(data.id, data.error);
    }
    if (data.warning) {
      notices.add_warning(data.id, data.warning);
    }
    done(null, data);

  });
});

function add_result(result) {
  var id = result.id;
  var region = result.region;
  if (!results.hasOwnProperty(region)) {
    results[region] = {};
  }

  delete result.id;
  delete result.region;
  results[region][id] = result;
}

function create_job(id, link, region_name) {
  var job = queue.create('data', { id: id, link: link, region_name: region_name });

  job.on('complete', function(result) {

    if (result.error) {
      console.log('Error "' + result.error + '" for ' + result.id);
    }
    else if (result.warning) {
      console.log('Warning "' + result.warning + '" for ' + result.id);
    }
    else {
      console.log('Completed for ' + result.id);
    }
    add_result(result);

    if (id == links_count - 1) {
      save_results();
    }

  }).removeOnComplete(true).save();
}

function save_results() {
  console.log('Finished for: ' + (Date.now() - start_time) / 1000 + 's');
  fs.writeFileSync("notices.json", JSON.stringify(notices.get_data(), null, 4));
  fs.writeFileSync("data.json", JSON.stringify(results, null, 4));
  process.exit();
}

function get_region_name(court_type, reg_id) {
  for (var i = 0; i < reg_ids.length; ++i) {
    if (reg_ids[i].court_type != court_type)
      continue;

    const regions = reg_ids[i].regions;
    for (var j = 0; j < regions.length; ++j) {
      if (regions[j].ids.indexOf(reg_id) > -1)
        return regions[j].name;
    }
  }
}

var links_count = 0;
for (i in links) {
  if (!links.hasOwnProperty(i))
    continue;

  var regions = links[i];
  for (j in regions) {
    if (!regions.hasOwnProperty(j))
      continue;

    create_job(links_count++, regions[j], get_region_name(i, j));
  }
}
