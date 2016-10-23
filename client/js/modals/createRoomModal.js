/*
 * Create a new room
 */

var CreateRoomModal = {};

CreateRoomModal.init = function init(successCallback) {
  /*
   * Create Room Modal Setup
   */
  var buildCreateRoomModal = function() {
    console.log("Building create room modal");
    $('.modal.createroom').modal({
      detachable: true,
      //By default, if click outside of modal, modal will close
      //Set closable to false to prevent this
      closable: false,
      transition: 'fade up',
      //Callback function for the submit button, which has the class of "ok"
      onApprove : function() {
        //Submits the semantic ui form
        //And pass the handling responsibilities to the form handlers, e.g. on form validation success
        $('.ui.form.createroom').submit();
        //Return false as to not close modal dialog
        return false;
      }
    });
    $('#add-room-button').unbind().click(function(e) {
      //Resets form input fields
      $('.ui.form.createroom').trigger("reset");
      //Resets form error messages
      $('.ui.form.createroom .field.error').removeClass( "error" );
      $('.ui.form.createroom.error').removeClass( "error" );
      //$('.modal.createroom').modal('show');
      CreateRoomModal.show(function(data) {
        // Do something here if needed
      });
    });
  };

  $(document).ready( buildCreateRoomModal );

  var createRoomFormSettings = {
    fields: {
      name: {
        identifier : 'name',
        rules: [
        {
          type   : 'empty',
          prompt : 'Please enter a valid room name'
        }
        ]
      },
      topic: {
        identifier : 'topic',
        //Below line sets it so that it only validates when input is entered, and won't validate on blank input
        optional   : true,
        rules: [
        {
          type   : 'empty',
          prompt : 'Please enter a valid room topic'
        }
        ]
      }
    },
    onSuccess : function()
    {
      //Hides modal on validation success
      $('.modal.createroom').modal('hide');

      var data = {
        name: $('.ui.form.createroom input[name="name"]').val(),
        topic: $('.ui.form.createroom input[name="topic"]').val(),
        encryptionScheme: $('.dropdown.encryptionscheme .selected').data().value,
        keepHistory: ($('.dropdown.messagehistory .selected').data().value === 'keep'),
        membershipRequired: ($('.dropdown.membershiprequired .selected').data().value === 'private')
      };

      socketClient.createRoom(data, function(err) {
        if (err) {
          return console.log("Error creating room: " + err);
        }
        console.log("Sent request to create room " + data.name);
      })
      return false;
    }
  }

  $(document).ready(function() {
    $('.ui.form.createroom').form(createRoomFormSettings);
  });
};


CreateRoomModal.show = function show(callback) {
  var self = this;

  $('.modal.createroom').modal('show');
  //self.init(callback);
};

$(document).ready( function() {
  CreateRoomModal.init(function() {
    console.log("[chatManager.document ready] Ran init for CreateRoomModal");
  });
});
