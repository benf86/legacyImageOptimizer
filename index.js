const config = require('./config');
const rp = require('request-promise');
let Duplex = require('stream').Duplex;
function bufferToStream(buffer) {
  let stream = new Duplex();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

var authToken = '';

const login = () => rp({
  method: 'POST',
  uri: `${config.ghost.api}/authentication/token`,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  form: {
    grant_type: 'password',
    username: config.ghost.username,
    password: config.ghost.password,
    client_id: config.ghost.clientId,
    client_secret: config.ghost.clientSecret,
  },
})
.then(response => JSON.parse(response))
.then(({ access_token: bearer }) => bearer);

const getBlogs = token => token && rp({
  method: 'GET',
  uri: `${config.ghost.api}/posts?limit=all`,
  headers: {
    Accept: 'application/json',
    Authorization: authToken = token
  }
}).then(JSON.parse);

const downloadImages = images =>
  Promise.all(images
  .map(image =>
    rp.get(`${config.ghost.host}${image.slice(0, image.length - 1).split('](')[1]}`,
          { encoding: null })
    .then(buffer => ({ name: image.split('](').pop().slice(0, -1), buffer }))
  ))

const uploadImages = images =>
  Promise.all(images.map(image =>
    rp({
      url: `${config.ghost.api}/uploads`,
      method: 'POST',
      formData:
        { uploadimage:
            { value: image.buffer,
              options:
              { filename: `optimized-${image.name.split('/').pop()}`,
                contentType: null } } },
        headers: {
        Authorization: authToken,
      }
    })
    .then(newUrl => ({ [image.name]: newUrl.replace('"', '') }) )
  ))
  .then(images => images.reduce((p, c) => Object.assign(p, c), {}));

const savePost = post => rp.put(`${config.ghost.api}/posts/${post.id}/`, {
  qs: { include: 'tags' },
  headers: {
    Authorization: authToken,
    'content-type': 'application/json; charset=UTF-8'
  },
  body: JSON.stringify({ posts: [post] })
})

const resetImagePath = post => {
  let regex = /\!\[(.*?)\]\((.*?)\)/gi;
  let matches = downloadImages(post.markdown.match(regex))
    .then(images => uploadImages(images))
    .then(urls => {
      post.markdown = post.markdown.replace(regex, (match, p1, p2) => `![${p1}](${urls[p2]})`)
      return post;
    })
    .then(() => savePost(post))
    .then(() => console.log(`${new Date().toISOString()} :: Updated :: ${post.title}`))
    .catch(e => console.log(`${new Date().toISOString()} :: Skipped :: ${post.title}`));
}

login()
.then(bearer => /* console.log(`Bearer: ${bearer}`) || */ `Bearer ${bearer}`)
.then(getBlogs)
.then(r => r.posts.map(resetImagePath))
