function filterTable(columnIndex) {
    var filterValues = [];
    var filterSelects = document.getElementsByClassName("filter");
    for (var i = 0; i < filterSelects.length; i++) {
      filterValues.push(filterSelects[i].value);
    }
    
    var table = document.getElementById("myTable");
    var rows = table.getElementsByTagName("tr");
    
    for (var i = 1; i < rows.length; i++) {
      var cells = rows[i].getElementsByTagName("td");
      var showRow = true;
      for (var j = 1; j < cells.length; j++) { // Start from 1 to skip the first column (Title)
        var cellText = cells[j].innerText || cells[j].textContent;
        if (filterValues[j - 1] !== "all" && cellText.trim().toUpperCase() !== filterValues[j - 1].toUpperCase()) {
          showRow = false;
          break;
        }
      }
      rows[i].style.display = showRow ? "" : "none";
    }
}

function openPopup(imageSrc) {
    var newWindow = window.open("", "", "width=400,height=400,top=100,left=100");
    newWindow.document.write('<img src="' + imageSrc + '" alt="Screenshot">');
    newWindow.document.close();
}

function openPopup(url) {
    // Define the width and height of the pop-up window
    var width = 800;
    var height = 600;

    // Calculate the left and top positions to center the pop-up window
    var left = (window.innerWidth - width) / 2;
    var top = (window.innerHeight - height) / 2;

    // Open the pop-up window with specified parameters
    window.open(url, 'popup', 'width=' + width + ', height=' + height + ', top=' + top + ', left=' + left + ', resizable=yes, scrollbars=yes, toolbar=no, menubar=no, location=no, status=no');
}
$(document).ready(function() {
    $('.select2').select2({
        templateResult: formatState,
        templateSelection: formatState
    });
});

function formatState(state) {
    if (!state.id) {
        return state.text;
    }

    var imageUrl = $(state.element).data('image');
    if (!imageUrl) {
        return state.text;
    }

    var $state = $('<span><img src="' + imageUrl + '" class="select2-thumbnail" /> ' + state.text + '</span>');
    return $state;
}