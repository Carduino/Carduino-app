jQuery(document).ready(function($) {

	//-----------------------------------------//
	//--------- Variables declarations --------//
	//-----------------------------------------//

	// Set some variables
	var appEnv = getAppEnv(),
		isAnimating = false,
		firstLoad = false,
		newScaleValue = 1,
		initPagePath = location.pathname.split('/'),
		initPageName = initPagePath[initPagePath.length - 1].replace('.html', ''),
		disconnected = false,
		rememberme = (window.localStorage.token) ? true : false,
		serverAddress = 'dauliac.fr:3000', // localhost:3000
		socket,
		token,
		root = [],
		plotedData = [];

	// Cache DOM elements
	var body = $('html > body'),
		dashboard = $('.side-navigation'),
		mainContent = $('.cd-main'),
		loadingBar = $('#loading-bar'),
		overlay = $('#overlay');



	//-----------------------------------------//
	//---------- Page initialization ----------//
	//-----------------------------------------//

	// Web / Mobile / Desktop app specificities
	$('#' + appEnv + '-img').show();

	// Set the section according the URL of the page
	if (initPageName === 'index' || initPageName === '') initPageName = 'dashboard';
	// 404
	if ($('.cd-section.' + initPageName).length < 1) initPageName = 'error-404';
	//select initial section
	//console.log(dashboard.find('*[data-menu="' + initPageName + '"]'));
	dashboard.find('*[data-menu="' + initPageName + '"]').addClass('selected');
	mainContent.find('.cd-section.' + initPageName).addClass('visible');


	//triggerAnimation(initPageName, false);

	//Prevent login-form to be submited thru a http POST request
	$('#login-form').on('submit', function() {
		event.preventDefault();
	});

	// Initialize Socket.IO Websocket connexion
	initSocketIO();



	//-----------------------------------------//
	//------- Authentication strategies -------//
	//-----------------------------------------//

	// When the Socket.IO Websocket connexion is established
	socket.on('connect', function() {
		//Choose the right initial authentication strategy
		if (window.localStorage.token) { // If a JWT is present (rememberme)
			// Authentication attempt with rememberme JWT
			tokenAuth(window.localStorage.token);
		} else if (token) {
			// Authentication attempt with in-memory JWT
			tokenAuth(token);
		} else { // If there is no rmemberme JWT
			setTimeout(function() {
				switchToLogin();
			}, 1000);
		}

		// When user submit crendentials
		$('#login-form').on('submit', function() {
			credentialsAuth();
		});
	});

	// When user is authenticated
	socket.on('authenticated', function() {
		authenticated = true;
		$('#auth-username').val('');
		$('#auth-password').val('');
		$('#auth-rememberme').prop('checked', false);
		switchToInfo('loading');
		setTimeout(function() {
			hideOverlay();
		}, 1000);
	});

	// When an invalid token has been used for authentication
	socket.on('unauthorized', function() {
		window.localStorage.clear();
		authenticated = false;
		token = null;
		switchToLogin('expired-login');
		resetInterface();
	});

	// When invalid credentials has been used for obtaining a token
	socket.on('invalidCredentials', function() {
		switchToLogin('invalid-login');
		authenticated = false;
	});

	// When the server send-back a token after a successfull authentication with credentials
	socket.on('validCredentials', function(validToken) {
		if (rememberme === true) window.localStorage.token = validToken;
		token = validToken;
		tokenAuth(validToken);
	});

	// When the Logout button is pressed
	$('#logout').on('click', function(event) {
		event.preventDefault();
		window.localStorage.clear();
		token = null;
		socket.disconnect();
		resetInterface();
		setTimeout(function() {
			socket.connect();
		}, 1000);
	});



	//-----------------------------------------//
	//------ Connexion failures handling ------//
	//-----------------------------------------//

	// When the arduino server is unrechable
	socket.on('connect_error', function() {
		if (!disconnected) switchToInfo('server-not-connected');
		authenticated = false;
	});

	// When the connexion with the server is lost
	socket.on('disconnect', function(error) {
		disconnected = true;
		if (error == 'transport close') { // Disconnection due to a networkor server failure
			switchToInfo('server-disconnected');
		} else if (error == 'io client disconnect') { // When a user log out
			switchToInfo('client-logout');
		} else { // Disconnection forced by the server
			switchToInfo('connexion-closed');
		}
		authenticated = false;
		resetInterface();
	});

	// When the connexion get reconnected conserving the same socket object after a disconnection event.
	socket.on('reconnect', function() {
		disconnected = false;
		if (authenticated) hideOverlay();
		//else switchToLogin();
	});



	//-----------------------------------------//
	//---------- Network tree events ----------//
	//-----------------------------------------//

	// When a node is added to the tree
	socket.on('addNode', function(addNode) {
		console.log('new-node ! : ');
		//addNode(addNode.parentNodeName, addNode.node);
	});

	// When a node is removed from the tree
	socket.on('removeNode', function(nodeName) {
		console.log('new-node ! : ' + nodeName);
		//removeNode(nodeName);
	});

	// When a node is updated in the tree
	socket.on('updateNode', function(node) {
		console.log('update-node ! : ');
		console.log(node);
		//updateNode(node);
	});

	// When the full tree is updated
	socket.on('treeUpdate', function(hubArray) {
		console.log('treeUpdate !');
		//updateTree(hubArray);
	});



	//-----------------------------------------//
	//--------------- Interface ---------------//
	//-----------------------------------------//

	// When the server send all datas to fill the interface
	socket.on('refreshInterface', function(interfaceDatas) {
		//refreshInterface(interfaceDatas);
	});



	//-----------------------------------------//
	//---------- Realtime Data Chart -----------//
	//-----------------------------------------//

	// Instanciating the chart
	var chart = c3.generate({
		bindto: '#chart',
		data: {
			x: 'date',
			columns: [],
			type: 'spline',
			//labels: true
		},
		axis: {
			x: {
				type: 'timeseries',
				tick: {
					format: '%H-%M-%S'
				}
			},
			y: {
				default: [50, 140],
				max: 140,
				min: 50,
			}
		},
		tooltip: {
			format: {
				name: function(name, ratio, id, index) {
					return name;
				},
				value: function(value, ratio, id, index) {
					return value;
				}
			}
		},
		zoom: {
			enabled: true
		},
		subchart: {
			show: true
		},
	});


	chart.resize({
		height: 500
	});

	// Plot data in the chart every 3 seconds
	setInterval(function() {
		//var date = new Date(),
		//	formatedDate = date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds();
		if (plotedData.length > 0) {
			var formatedDate = Date.now();
			plotedData.push(['date', formatedDate]);
			console.log(plotedData);
			chart.flow({
				columns: plotedData,
				length: 0,
				duration: 800,
				done: function() {
					var dateIndex = plotedData.findIndex(function(date) {
						return date[0] === 'date';
					});
					if (dateIndex > -1) {
						plotedData.splice(dateIndex, 1);
					}
					for (i = 0; i < plotedData.length; i++) {
						plotedData[i] = [plotedData[i][0], null];
					}
				}
			});
		}
	}, 3000);

	/*
	setTimeout(function() {
		chart = chart.destroy();
	}, 15000);
	*/

	// When the server send sensors datas to fill the interface
	socket.on('sensorData', function(sensorData) {
		var sensorIndex = plotedData.findIndex(function(sensor) {
			return sensor[0] === sensorData.name;
		});
		if (sensorIndex > -1) {
			plotedData[sensorIndex] = [sensorData.name, sensorData.bpm];
		} else {
			plotedData.push([sensorData.name, sensorData.bpm]);
		}
	});



	//-----------------------------------------//
	//--------------- Functions ---------------//
	//-----------------------------------------//

	function getAppEnv() {
		var appEnv = 'web';
		if (navigator.userAgent == 'Carduino-desktop') {
			appEnv = 'desktop';
		} else if (navigator.userAgent.match(/Android/i) ||
			navigator.userAgent.match(/webOS/i) ||
			navigator.userAgent.match(/iPhone/i) ||
			navigator.userAgent.match(/iPad/i) ||
			navigator.userAgent.match(/iPod/i) ||
			navigator.userAgent.match(/BlackBerry/i) ||
			navigator.userAgent.match(/Windows Phone/i)) {
			appEnv = 'mobile';
		}
		return appEnv;
	}

	function initSocketIO() {
		socket = io.connect('ws://' + serverAddress, {
			//'forceNew': true
		});
	}

	function credentialsAuth() {
		socket.emit('credentialsAuth', {
			username: $('#auth-username').val(),
			password: $('#auth-password').val(),
			rememberme: $('#auth-rememberme').prop('checked')
		});
		rememberme = $('#auth-rememberme').prop('checked');
	}

	function tokenAuth(authToken) {
		socket.emit('authenticate', {
			token: authToken
		});
	}

	function switchToLogin(option) {
		$('#info-message').hide();

		$('.login-info').hide();
		if (option) $('#' + option).show();

		$('#login-form').show();
		$('#auth-username').focus();
		showOverlay();
	}

	function switchToInfo(message) {
		$('#login-form').hide();
		$('#' + message).show().siblings('.message').hide();
		$('#info-message').show();
		showOverlay();
	}

	function hideOverlay() {
		overlay.fadeOut(300);
	}

	function showOverlay() {
		overlay.fadeIn(300);
	}

	function resetInterface() {
		//updateTree({});
		// ... À compléter
		// ...
		// ...
	}

	function refreshInterface(interfaceDatas) {
		updateTree(interfaceDatas.networkTree);
		// ... À compléter
		// ...
		// ...
	}



	//-----------------------------------------//
	//------- Interface base management -------//
	//-----------------------------------------//

	// Log current state in history
	function saveHistory(selected) {
		var new_section = selected.attr('href');
		if (appEnv === 'desktop') new_section += '.html';
		console.log(new_section);
		window.history.pushState({
			path: new_section
		}, '', new_section);
	}

	// Select a new section
	dashboard.on('click', 'a:not(#logout)', function(event) {
		event.preventDefault();
		var target = $(this),
			//detect which section user has chosen
			sectionTarget = target.data('menu');
		if (!target.hasClass('selected') && !isAnimating) {
			//if user has selected a section different from the one alredy visible - load the new content
			triggerAnimation(sectionTarget, true);
			saveHistory(target);
		}
		firstLoad = true;
	});

	//detect the 'popstate' event - e.g. user clicking the back button
	$(window).on('popstate', function() {
		if (firstLoad) {
			//Safari emits a popstate event on page load - check if firstLoad is true before animating
			//if it's false - the page has just been loaded
			var newPageArray = location.pathname.split('/'),
				//this is the url of the page to be loaded
				newPage = newPageArray[newPageArray.length - 1];
			if (!isAnimating) triggerAnimation(newPage, false);
		}
		firstLoad = true;
	});

	//start animation
	function triggerAnimation(newSection, bool) {
		isAnimating = true;
		//newSection = (newSection === '') ? 'dashboard' : newSection;

		//update dashboard
		dashboard.find('*[data-menu="' + newSection + '"]').addClass('selected').parent('li').siblings('li').children('.selected').removeClass('selected');
		//trigger loading bar animation
		initializeLoadingBar(newSection);
		//load new content
		loadNewContent(newSection, bool);
	}

	function initializeLoadingBar(section) {
		var selectedItem = dashboard.find('.selected'),
			barHeight = selectedItem.outerHeight(),
			barTop = selectedItem.offset().top,
			windowHeight = $(window).height(),
			maxOffset = (barTop + barHeight / 2 > windowHeight / 2) ? barTop : windowHeight - barTop - barHeight,
			scaleValue = ((2 * maxOffset + barHeight) / barHeight).toFixed(3) / 1 + 0.001;

		//place the loading bar next to the selected dashboard element
		loadingBar.data('scale', scaleValue).css({
			height: barHeight,
			top: barTop
		}).attr('class', '').addClass('loading ' + section);
	}

	function loadNewContent(newSection, bool) {
		setTimeout(function() {
			//animate loading bar
			loadingBarAnimation();

			//create a new section element and insert it into the DOM
			var section = $('section.cd-section.' + newSection);
			section.addClass('overflow-hidden');

			//finish up the animation and then make the new section visible
			var scaleMax = loadingBar.data('scale');

			loadingBar.velocity('stop').velocity({
				scaleY: scaleMax
			}, 400, function() {
				//add the .visible class to the new section element -> it will cover the old one
				$('section.cd-section.visible').removeClass('visible');
				section.addClass('visible').on(
					'webkitTransitionEnd otransitionend oTransitionEnd msTransitionEnd transitionend',
					function() {
						resetAfterAnimation(section);
					});

				//if browser doesn't support transition
				if ($('.no-csstransitions').length > 0) {
					resetAfterAnimation(section);
				}
			});
		}, 50);
	}

	function loadingBarAnimation() {
		var scaleMax = loadingBar.data('scale');
		if (newScaleValue + 1 < scaleMax) {
			newScaleValue = newScaleValue + 1;
		} else if (newScaleValue + 0.5 < scaleMax) {
			newScaleValue = newScaleValue + 0.5;
		}

		loadingBar.velocity({
			scaleY: newScaleValue
		}, 100, loadingBarAnimation);
	}

	function resetAfterAnimation(newSection) {
		//once the new section animation is over, remove the old section and make the new one scrollable
		newSection.removeClass('overflow-hidden');
		isAnimating = false;
		//reset your loading bar
		resetLoadingBar();
	}

	function resetLoadingBar() {
		loadingBar.removeClass('loading').velocity({
			scaleY: 1
		}, 1);
	}



	//-----------------------------------------//
	//------------- Network Tree --------------//
	//-----------------------------------------//

	// ...
	var margin = {
			top: 40,
			right: 90,
			bottom: 20,
			left: 110
		},
		width = $('#network-graph').width() - margin.right - margin.left,
		height = $(window).height() - $('#network-graph').offset().top - 20,
		i = 0,
		duration = 750;

	// ...
	var tree = d3.layout.tree().size([height - margin.top - margin.bottom, width]),
		diagonal = d3.svg.diagonal().projection(function(d) {
			return [d.y, d.x];
		});

	// ...
	var svg = d3.select('#network-graph').append("svg")
		.attr("width", '100%')
		.attr("height", height)
		.append("g")
		.attr("transform", "translate(" + margin.left + "," + margin.top + ")");

	// ...
	$.getJSON("test.json", function(tree) {
		root = tree;
		root.x0 = height / 2;
		root.y0 = 0;

		function collapse(d) {
			if (d.children) {
				d._children = d.children;
				d._children.forEach(collapse);
				d.children = null;
			}
		}
		//root.children.forEach(collapse);
		update(root);
	});

	/*
	$.getJSON('test2.json', function(addTheseJSON) {
		var newnodes = tree.nodes(addTheseJSON.children).reverse();
		d.children = newnodes[0];
		update(d);
	});
	*/

	// Draw/Update the network tree
	function update(source) {
		// Compute the new tree layout.
		var nodes = tree.nodes(root).reverse(),
			links = tree.links(nodes);
		// Normalize for fixed-depth.
		nodes.forEach(function(d) {
			d.y = d.depth * (($('#network-graph').width() - 110 - 90) / 2);
		});
		// Update the nodes…
		var node = svg.selectAll("g.node")
			.data(nodes, function(d) {
				return d.id || (d.id = ++i);
			});
		// Enter any new nodes at the parent's previous position.
		var nodeEnter = node.enter().append("g")
			.attr("class", "node")
			.attr("transform", function(d) {
				return "translate(" + source.y0 + "," + source.x0 + ")";
			})
			.on("click", click);
		nodeEnter.append("circle")
			.attr("r", 1e-6)
			.style("fill", function(d) {
				return d._children ? "lightsteelblue" : "#fff";
			});
		nodeEnter.append("text")
			.attr("x", function(d) {
				if (d.depth === 0) return -10;
				else if (d.depth === 1) return 0;
				else return 10;
			})
			.attr("y", function(d) {
				if (d.depth === 1) return -15;
				else return -1;
			})
			.attr("dy", ".35em")
			.attr("text-anchor", function(d) {
				if (d.depth === 0) return "end";
				else if (d.depth === 1) return "middle";
				else return "start";
			})
			.text(function(d) {
				return d.name;
			})
			.style("fill-opacity", 1e-6);

		nodeEnter.append("text")
			.attr("class", function(d) {
				return "children";
			})
			.attr("x", function(d) {
				return 0;
			})
			.attr("y", function(d) {
				return 15;
			})
			.attr("dy", ".35em")
			.attr("text-anchor", function(d) {
				return "middle";
			})
			.text(function(d) {
				if (d.depth === 1) {
					if (d._children) return d._children.length;
					else if (d.children) return d.children.length;
					else return 0;
				}
			})
			.style("fill-opacity", 1e-6);
		// Transition nodes to their new position.
		var nodeUpdate = node.transition()
			.duration(duration)
			.attr("transform", function(d) {
				return "translate(" + d.y + "," + d.x + ")";
			});
		nodeUpdate.select("circle")
			.attr("r", 6)
			.style("fill", function(d) {
				return d._children ? "lightsteelblue" : "#fff";
			});
		nodeUpdate.select("text")
			.style("fill-opacity", 1);
		nodeUpdate.select("text.children")
			.style("fill-opacity", 1);
		// Transition exiting nodes to the parent's new position.
		var nodeExit = node.exit().transition()
			.duration(duration)
			.attr("transform", function(d) {
				return "translate(" + source.y + "," + source.x + ")";
			})
			.remove();
		nodeExit.select("circle")
			.attr("r", 1e-6);
		nodeExit.select("text")
			.style("fill-opacity", 1e-6);
		nodeExit.select("text.children")
			.style("fill-opacity", 1e-6);
		// Update the links…
		var link = svg.selectAll("path.link")
			.data(links, function(d) {
				return d.target.id;
			});
		// Enter any new links at the parent's previous position.
		link.enter().insert("path", "g")
			.attr("class", "link")
			.attr("d", function(d) {
				var o = {
					x: source.x0,
					y: source.y0
				};
				return diagonal({
					source: o,
					target: o
				});
			});
		// Transition links to their new position.
		link.transition()
			.duration(duration)
			.attr("d", diagonal);
		// Transition exiting nodes to the parent's new position.
		link.exit().transition()
			.duration(duration)
			.attr("d", function(d) {
				var o = {
					x: source.x,
					y: source.y
				};
				return diagonal({
					source: o,
					target: o
				});
			})
			.remove();
		// Stash the old positions for transition.
		nodes.forEach(function(d) {
			d.x0 = d.x;
			d.y0 = d.y;
		});
	}

	// Toggle children on click.
	function click(d) {
		if (d.children) {
			d._children = d.children;
			d.children = null;
		} else {
			d.children = d._children;
			d._children = null;
		}
		update(d);
	}

	function findNodeChildren(node) {
		if (node) {
			if (node._children) return node._children;
			else if (node.children) return node.children;
			else return null;
		} else return null;
	}

	function addNode(parentNodeName, node) {
		var parentNode = null;
		if (parentNodeName === 'Carduino-server') {
			parentNode = root;
		} else {
			var nodeIndex = findNodeChildren(root).findIndex(function(node) {
				return node.name === parentNodeName;
			});
			if (nodeIndex > -1) {
				parentNode = findNodeChildren(root)[nodeIndex];
			}
		}
		if (findNodeChildren(parentNode)) {
			findNodeChildren(parentNode).push(node);
		}
		update(root);
		console.log(root);
	}

	function removeNode(nodeName) {
		var test = function(nodeToTest) {
			return nodeToTest.name === nodeName;
		};
		var nodeIndex = findNodeChildren(root).findIndex(test);
		if (nodeIndex > -1) {
			findNodeChildren(root).splice(nodeIndex, 1);
			update(root);
		} else {
			for (i = 0; i < findNodeChildren(root).length; i++) {
				if (findNodeChildren(findNodeChildren(root)[i])) {
					nodeIndex = findNodeChildren(findNodeChildren(root)[i]).findIndex(test);
					if (nodeIndex > -1) {
						findNodeChildren(findNodeChildren(root)[i]).splice(nodeIndex, 1);
						update(root);
					}
				}
			}
		}
		console.log(root);
	}

	function updateNode(newNode) {
		var test = function(nodeToTest) {
			return nodeToTest.name === newNode.name;
		};
		var nodeIndex = findNodeChildren(root).findIndex(test);
		if (nodeIndex > -1) {
			findNodeChildren(root)[nodeIndex] = newNode;
			update(root);
		} else {
			for (i = 0; i < findNodeChildren(root).length; i++) {
				nodeIndex = findNodeChildren(findNodeChildren(root)[i]).findIndex(test);
				if (nodeIndex > -1) {
					findNodeChildren(findNodeChildren(root)[i])[nodeIndex] = newNode;
					update(root);
				}
			}
		}
		console.log(root);
	}

	function updateTree(hubArray) {
		$.getJSON("test.json", function(tree) {
			root = tree;
			root.x0 = height / 2;
			root.y0 = 0;
			if (root._children) root._children = hubArray;
			else if (root.children) root.children = hubArray;
			else root.children = root._children = hubArray;
			if (findNodeChildren(root)) {
				for (i = 0; i < hubArray.length; i++) {
					findNodeChildren(root).push(hubArray[i]);
				}
			}
		});
		update(root);
	}

	// Adapt the height of the tree when the window is resized
	$(window).on('resize', function() {
		height = $(window).height() - $('#network-graph').offset().top - 20;
		width = $('#network-graph').width() - margin.right - margin.left;
		tree.size([height - margin.top - margin.bottom, width]);
		$('#network-graph svg').attr("height", height);
		update(root);
	});
});
