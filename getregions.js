/**
 * Gathering court regions.
 */

const casper = require('casper').create({
  logLevel: "debug"
});

const fs = require('fs');

casper.on('remote.message', function(message) {
  this.echo(message);
});

casper.start('http://court.gov.ua/sudy/');

var links = [];
casper.waitFor(function check() {
  var result = this.evaluate(function() {

    // Extending String prototype.
    if (!String.prototype.format) {
      String.prototype.format = function() {
        var args = arguments;
        return this.replace(/{(\d+)}/g, function(match, number) {
          return typeof args[number] != 'undefined'
            ? args[number]
            : match
            ;
        });
      };
    }

    function get_reg_ids(reg_data) {
      function extract_reg_id(reg_str) {
        var reg_id = '';
        for (var i = 0; i < reg_str.length; ++i) {
          var char = reg_str[i];
          if (isNaN(char)) {
            break;
          }
          reg_id += char;
        }
        return reg_id;
      }

      var reg_ids = [];
      for (var i = 0; i < reg_data.length; ++i) {
        reg_ids[i] = extract_reg_id(reg_data[i]);
      }
      return reg_ids;
    }

    const selects = document.querySelectorAll('form select[name="foo1"]');

    if (selects.length != 4) {
      return false;
    }

    const initial_court_type = 5;
    const last_select_index = selects.length - 1;
    var regions = [];

    function gather_regions() {
      for (var i = 0; i < last_select_index; ++i) {
        const options = $(selects[i]).children();
        regions[i] = {
          court_type: initial_court_type + i,
          regions: []
        };
        for (var j = 0; j < options.length; ++j) {
          regions[i].regions[j] = {
            name: options[j].text,
            ids: get_reg_ids(window['obl{0}_{1}'.format(i + 1, options[j].value)])
          };
        }
      }
    }

    function gather_regions_last_court_type() {
      const options = $(selects[last_select_index]).children();
      regions[last_select_index] = {
        court_type: initial_court_type + last_select_index,
        regions: []
      };
      for (var i = 0; i < options.length; ++i) {
        var ids = [];
        const city_ids = get_reg_ids(window['mis1_{0}'.format(options[i].value)]);
        for (var j = 0; j < city_ids.length; ++j) {
          ids = ids.concat(get_reg_ids(window['raj1_{0}'.format(city_ids[j])]))
        }
        regions[last_select_index].regions[i] = {
          name: options[i].text,
          ids: ids
        };
      }
    }

    gather_regions();
    gather_regions_last_court_type();

    return regions;

  });

  if (result) {
    links = result;
    return true;
  }
  return false;

}, function then() {

  console.log('wow');
  console.log(links);
  try {
    console.log(fs);
    fs.write("regions.json", JSON.stringify(links, null, 4), 'w');
  }
  catch (err) {
    console.log(err);
  }

  console.log(links);

}, function timeout() {

  this.echo('init timeout');

});

casper.run();
