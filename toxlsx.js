var Excel = require('exceljs');

var filename = 'Courts.xlsx';

// read from a file
var workbook = new Excel.Workbook();
workbook.xlsx.readFile(filename)
  .then(fill());

function fill() {
  console.log('WRITING');
  workbook.eachSheet(function(worksheet, sheetId) {
    console.log(worksheet.name + ": " + sheetId);
  });
  //var worksheet = workbook.getWorksheet(1);
  //worksheet.getCell('B2').value = 'oooo';

  workbook.xlsx.writeFile(filename)
    .then(function() {
      console.log('DONE');
      process.exit(0);
    });
}
