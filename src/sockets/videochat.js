import appointHelper from '../app/helper/appointment.js';

/**
 * Modified from http://stackoverflow.com/a/41519537
 * @param  {[type]} room [description]
 * @return {[type]}      [description]
 */
function getClientsInRoom(room) {
  // get array of socket ids in this room
  var socketIds = io.sockets.adapter.rooms[room];
  var clients = [];

  if (socketIds && socketIds.length > 0) {
    //socketsCount = socketIds.lenght;

    // push every client to the result array
    for (var i = 0, len = socketIds.length; i < len; i++) {
      // check if the socket is not the requesting
      // socket
      if (socketIds.sockets[i] != socketId) {
          clients.push(chatClients[Object.keys(socketIds.sockets)[i]]);
      }
    }
  }

  return clients;
}

export default (socket, io) => {

  const user = () => socket.decoded_token._doc;
  const members = () => io.sockets.adapter.rooms['AppointmentCall']
    ? io.sockets.adapter.rooms['AppointmentCall'].length
    : 0;
  const inRoom = () => io.sockets.adapter.sids[socket.id]['AppointmentCall'] ? true : false;

  /**
   * The ':join' event is being used for
   *   - authorizing an user to join the appointment
   *   - actually joining the appointment
   */
  socket.on('videochat:join', async appointmentOnly => {
    const count = members();

    // only allow max. 2 participants
    if (count >= 2) {
      return;
    }

    // try to find an appointment that is due right now that the user can join
    const appointment = await appointHelper.getNow(user(), count === 1);

    socket.emit('appointment', appointment);

    if (appointment && appointmentOnly !== true) {
      socket.join('AppointmentCall');

      const initiator = (count === 1);

      socket.emit('videochat:status', {
        rtcInitiator: initiator
      });

      socket.broadcast.to('AppointmentCall').emit('videochat:status', {
        rtcInitiator: !initiator
      });

      io.to('AppointmentCall').emit('videochat:status', {
        doConnect: initiator,
        message: initiator ? 'Connecting.' : 'Waiting for opponent.'
      });
      if (count === 1) {
      }

      io.to('AppointmentCall').emit('videochat:message', {
        isMeta: true,
        text: user().name + ' joined the appointment.'
      });
    }
  });

  /**
   * The ':reconnect' event is being used when a user disconnects
   * without reason. It sets the connection status back to
   *   - 1 if the disconnected user also left the socket room 'AppointmentCall'
   *   - 2 if the user is still in the socket room 'AppointmentCall'
   */
  socket.on('videochat:reconnect', () => {
    if (!inRoom()) {
      return;
    }

    console.log('reconnect');
    let status = { connected: false };

    if (members() === 2) {
      status.message = 'Reconnecting... Please hold on.';
      status.doConnect = true;
    } else {
      status.message = 'Connection interrupted. Waiting for opponent to rejoin.';
    }

    io.to('AppointmentCall').emit('videochat:status', status);
    io.to('AppointmentCall').emit('videochat:message', {
      isMeta: true,
      text: 'Connection was interrupted.'
    });
  });

  /**
   * The ':message' event is being used for sending and receiving
   * text messages between the two members of the live appointment call.
   */
  socket.on('videochat:message', (message, isMeta) => {
    if (!inRoom() || message.length > 500) {
      return;
    }

    const userNow = user();

    io.to('AppointmentCall').emit('videochat:message', {
      isMeta: isMeta,
      user: {
        _id: userNow._id,
        name: userNow.name
      },
      text: (isMeta ? userNow.name + ' ' : '') + message
    });
  });

  /**
   * The ':signal' event is being used for exchanging signaling data
   * for the WebRTC connection between the two members of the live appointment call.
   */
  socket.on('videochat:signal', data => {
    if (!inRoom()) {
      return;
    }

    socket.broadcast.to('AppointmentCall').emit('videochat:signal', data);
  });

  /**
   * The ':leave' event is being used for ending the appointment.
   */
  socket.on('videochat:leave', () => {
    if (!inRoom()) {
      return;
    }

    socket.leave('AppointmentCall');
    io.to('AppointmentCall').emit('videochat:status', {
      doEnd: true
    });
  });
}
