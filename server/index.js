'use strict';
const { createApp } = require('./app');

const port = Number(process.env.PORT) || 3000;
const { server, generatedPassword } = createApp();
server.listen(port, () => {
  console.log(`Wash Wala running on http://localhost:${port}`);
  console.log(`Admin panel:        http://localhost:${port}/admin/`);
  if (generatedPassword) {
    console.log('\n  First run. Your admin password is:\n\n    ' + generatedPassword + '\n\n  Save it now, it is not shown again. Change it in Admin > Settings.\n');
  }
});
