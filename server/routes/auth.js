var passport = require('passport');
//var passportPublicKey = require('passport-publickey');

function Auth(app) {
  app.post('/login',
    passport.authenticate('keyverify', { session: false }),
    function(req, res) {
      console.log("IT WORKEEEDDDDD");
      return res.sendStatus(200);
    }
  );

  app.post('/sessiontest',
    passport.authenticate('keyverify', { session: false }),
    function(req, res) {
      console.log("Authentication worked!");
      return res.sendStatus(200);
    }
  );
};

module.exports = Auth;
