// *************************************************
// * Constants
// *************************************************

var MAX_K_MEANS_PIXELS = 50000;

//*************************************************
//* Image/Data Processing
//*************************************************

// Checks for equality of elements in two arrays.
var arrays_equal = function(a1, a2) {
  if (a1.length !== a2.length) return false;
  for (var i = 0; i < a1.length; ++i) {
    if (a1[i] !== a2[i]) return false;
  }
  return true;
};

// Given width w and height h, rescale the dimensions to satisfy
// the specified number of pixels.
var rescale_dimensions = function(w, h, pixels) {
  var aspect_ratio = w / h;
  var scaling_factor = Math.sqrt(pixels / aspect_ratio);
  var rescaled_w = Math.floor(aspect_ratio * scaling_factor);
  var rescaled_h = Math.floor(scaling_factor);
  return [rescaled_w, rescaled_h];
};

// Given an Image, return a dataset with pixel colors.
// If resized_pixels > 0, image will be resized prior to building
// the dataset.
// return: [[R,G,B,a], [R,G,B,a], [R,G,B,a], ...]
var get_pixel_dataset = function(img, resized_pixels) {
  if (resized_pixels === undefined) resized_pixels = -1;
  // Get pixel colors from a <canvas> with the image
  var canvas = document.createElement("canvas");
  var img_n_pixels = img.width * img.height;
  var canvas_width = img.width;
  var canvas_height = img.height;
  if (resized_pixels > 0 && img_n_pixels > resized_pixels) {
    var rescaled = rescale_dimensions(img.width, img.height, resized_pixels)
    canvas_width = rescaled[0];
    canvas_height = rescaled[1];
  }
  canvas.width = canvas_width;
  canvas.height = canvas_height;
  var canvas_n_pixels = canvas_width * canvas_height;
  var context = canvas.getContext("2d");
  context.drawImage(img, 0, 0, canvas_width, canvas_height);  
  var flattened_dataset = context.getImageData(
      0, 0, canvas_width, canvas_height).data;
  var n_channels = flattened_dataset.length / canvas_n_pixels;
  var dataset = [];
  for (var i = 0; i < flattened_dataset.length; i += n_channels) {
    dataset.push(flattened_dataset.slice(i, i + n_channels));
  }
  return dataset;
};

// Given a point and a list of neighbor points, return the index
// for the neighbor that's closest to the point.
var nearest_neighbor = function(point, neighbors) {
  var best_dist = Infinity; // squared distance
  var best_index = -1;
  for (var i = 0; i < neighbors.length; ++i) {
    var neighbor = neighbors[i];
    var dist = 0;
    for (var j = 0; j < point.length; ++j) {
      dist += Math.pow(point[j] - neighbor[j], 2);
    }
    if (dist < best_dist) {
      best_dist = dist;
      best_index = i;
    }
  }
  return best_index;
};

// Returns the centroid of a dataset.
var centroid = function(dataset) {
  if (dataset.length === 0) return [];
  // Calculate running means.
  var running_centroid = [];
  for (var i = 0; i < dataset[0].length; ++i) {
    running_centroid.push(0);
  }
  for (var i = 0; i < dataset.length; ++i) {
    var point = dataset[i];
    for (var j = 0; j < point.length; ++j) {
      running_centroid[j] += (point[j] - running_centroid[j]) / (i+1);
    }
  }
  return running_centroid;
};

// Returns the k-means centroids.
var k_means = function(dataset, k) {
  if (k === undefined) k = Math.min(3, dataset.length);
  // Use a seeded random number generator instead of Math.random(),
  // so that k-means always produces the same centroids for the same
  // input.
  rng_seed = 0;
  var random = function() {
    rng_seed = (rng_seed * 9301 + 49297) % 233280;
    return rng_seed / 233280;
  };
  // Choose initial centroids randomly.
  centroids = [];
  for (var i = 0; i < k; ++i) {
    var idx = Math.floor(random() * dataset.length);
    centroids.push(dataset[idx]);
  }
  while (true) {
    // 'clusters' is an array of arrays. each sub-array corresponds to
    // a cluster, and has the points in that cluster.
    var clusters = [];
    for (var i = 0; i < k; ++i) {
      clusters.push([]);
    }
    for (var i = 0; i < dataset.length; ++i) {
      var point = dataset[i];
      var nearest_centroid = nearest_neighbor(point, centroids);
      clusters[nearest_centroid].push(point);
    }
    var converged = true;
    for (var i = 0; i < k; ++i) {
      var cluster = clusters[i];
      var centroid_i = [];
      if (cluster.length > 0) {
        centroid_i = centroid(cluster);
      } else {
        // For an empty cluster, set a random point as the centroid.
        var idx = Math.floor(random() * dataset.length);
        centroid_i = dataset[idx];
      }
      converged = converged && arrays_equal(centroid_i, centroids[i]);
      centroids[i] = centroid_i;
    }
    if (converged) break;
  }
  return centroids;
};

// Takes an <img> as input. Returns a quantized data URL.
var quantize = function(img, colors) {
  var width = img.width;
  var height = img.height;
  var source_canvas = document.createElement("canvas");
  source_canvas.width = width;
  source_canvas.height = height;
  var source_context = source_canvas.getContext("2d");
  source_context.drawImage(img, 0, 0, width, height);
  
  // flattened_*_data = [R, G, B, a, R, G, B, a, ...] where
  // (R, G, B, a) groups each correspond to a single pixel, and they are
  // column-major ordered.
  var flattened_source_data = source_context.getImageData(
      0, 0, width, height).data;
  var n_pixels = width * height;
  var n_channels = flattened_source_data.length / n_pixels;
  
  var flattened_quantized_data = new Uint8ClampedArray(
      flattened_source_data.length);
  
  // Set each pixel to its nearest color.
  var current_pixel = new Uint8ClampedArray(n_channels);
  for (var i = 0; i < flattened_source_data.length; i += n_channels) {
    // This for loop approach is faster than using Array.slice().
    for (var j = 0; j < n_channels; ++j) {
      current_pixel[j] = flattened_source_data[i + j];
    }
    var nearest_color_index = nearest_neighbor(current_pixel, colors);
    var nearest_color = centroids[nearest_color_index];
    for (var j = 0; j < nearest_color.length; ++j) {
      flattened_quantized_data[i+j] = nearest_color[j];
    }
  }
  
  var quantized_canvas = document.createElement("canvas");
  quantized_canvas.width = width;
  quantized_canvas.height = height;
  var quantized_context = quantized_canvas.getContext("2d");
  
  var image = quantized_context.createImageData(width, height);
  image.data.set(flattened_quantized_data);
  quantized_context.putImageData(image, 0, 0);
  data_url = quantized_canvas.toDataURL();
  return data_url;
};

// *************************************************
// * HTML
// *************************************************

// HTML Elements
var input_file_element = document.getElementById("input_file");
var quantize_btn_element = document.getElementById("quantize_btn");
var k_selections_element = document.getElementById("k_selections");
var status_element = document.getElementById("status");
var quantized_img_element = document.getElementById("quantized_img");
var modal_element = document.getElementById('modal');
var close_element = document.getElementById("close");

ESC_KEYCODE = 27;

MODAL_HIDDEN_STYLE = "none";
MODAL_SHOWN_STYLE = "block";

var hide_modal = function() {
  modal_element.style.display = MODAL_HIDDEN_STYLE;
};

var show_modal = function() {
  modal_element.style.display = MODAL_SHOWN_STYLE;
};

var modal_is_shown = function() {
  return modal_element.style.display === MODAL_SHOWN_STYLE;
};

close_element.onclick = function() {
  hide_modal();
};

modal_element.onclick = function() {
  hide_modal();
};

document.addEventListener('keyup', function(event) {
  if (event.keyCode === ESC_KEYCODE && modal_is_shown()) {
    hide_modal();
  }
});

quantized_img_element.onclick = function(event) {
  // Prevent the click from being passed to the modal element.
  event.stopPropagation();
};

// Fill k selections.
k_options = [2,3,4,5,6,7,8,9,10,11,12];
default_k = 3;
for (var i = 0; i < k_options.length; ++i) {
  var k = k_options[i];
  var option_element = document.createElement("option");
  option_element.value = k;
  option_element.textContent = k;
  k_selections_element.appendChild(option_element);
  if (k === default_k) k_selections_element.selectedIndex = i;
}

// Enable the quantize button if a file has been selected, and
// disable otherwise.
var set_quantize_button = function() {
  files = input_file_element.files;
  quantize_btn_element.disabled = !files || !files.length;
};

input_file_element.addEventListener("change", set_quantize_button);
window.addEventListener("load", set_quantize_button);

var pre_quantize = function() {
  // Clear any existing image.
  if (quantized_img.hasAttribute("src")) {
    quantized_img.removeAttribute("src");
  }
  quantize_btn_element.disabled = true;
  input_file_element.disabled = true;
  k_selections_element.disabled = true;
  status_element.textContent = "Processing...";
};

var post_quantize = function() {
  quantize_btn_element.disabled = false;
  input_file_element.disabled = false;
  k_selections_element.disabled = false;
  status_element.textContent = "";
};

// Handle "Quantize" button.
quantize_btn_element.addEventListener("click", function() {
  files = input_file_element.files;
  if (!FileReader || !files || !files.length) return;
  var quantized_img = document.getElementById("quantized_img");
  var reader = new FileReader();
  reader.addEventListener("load", function() {
    var k = parseInt(k_selections_element.value);
    var img = new Image();
    img.onload = function() {
      // Use a combination of requestAnimationFrame and setTimeout
      // to run quantize/post_quantize after the next repaint, which is
      // triggered by pre_quantize().
      requestAnimationFrame(function() {
        setTimeout(function() {
          // Use a fixed maximum so that k-means works fast.
          var pixel_dataset = get_pixel_dataset(img, MAX_K_MEANS_PIXELS);
          var centroids = k_means(pixel_dataset, k);
          var data_url = quantize(img, centroids);
          quantized_img_element.src = data_url;
          show_modal();
          post_quantize();
        }, 0);
      });
      pre_quantize();
    };
    img.src = reader.result;
  });
  reader.readAsDataURL(files[0]);
});
