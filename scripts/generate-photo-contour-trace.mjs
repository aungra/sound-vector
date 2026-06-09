import fs from "node:fs";
import path from "node:path";

const imageDir = "images";
fs.mkdirSync(imageDir, { recursive: true });

const stroke = "#111111";
const parts = [];

function pathEl(d, width = 3.8) {
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function ellipse(cx, cy, rx, ry, width = 3.8) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${stroke}" stroke-width="${width}" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function line(x1, y1, x2, y2, width = 3.8) {
  return pathEl(`M${x1} ${y1}L${x2} ${y2}`, width);
}

// Coordinates are traced against a crop of DSC_7740.jpg:
// sips --cropToHeightWidth 1500 1800 --cropOffset 1450 330 DSC_7740.jpg
// The SVG scales that crop into the 1200px artboard.

// Flag: outer cloth, pole sleeve, and visible color-field boundaries as line-only shapes.
parts.push(pathEl("M606 711 C745 740 895 812 1060 900 C1190 970 1340 1000 1484 980 C1529 976 1562 1008 1560 1052 C1483 1092 1436 1166 1402 1266 C1248 1285 1095 1362 948 1464 C850 1489 741 1458 682 1395 C626 1335 584 1215 545 1033 C529 954 549 804 606 711Z", 5.8));
parts.push(pathEl("M574 745 C603 928 652 1165 708 1461", 4.8));
parts.push(pathEl("M628 731 C813 801 958 874 1127 995 C1048 1046 965 1124 887 1239 C776 1175 676 1111 571 1040", 4.2));
parts.push(pathEl("M886 1241 C1040 1240 1194 1244 1409 1262", 4.2));
parts.push(pathEl("M1125 996 C1244 1005 1377 1001 1553 1035", 4.2));
parts.push(pathEl("M706 1456 C803 1376 852 1298 887 1240", 4.2));
parts.push(pathEl("M608 711 C582 965 596 1220 652 1492", 4.5));
parts.push(line(610, 704, 741, 1490, 5.5));
parts.push(line(652, 720, 780, 1498, 3.8));
parts.push(pathEl("M586 732 C616 714 646 712 676 732", 3.2));
parts.push(pathEl("M1374 1236 C1408 1205 1448 1212 1478 1250", 4.2));

// Left man: shaved head, sunglasses on head, cup, T-shirt, shorts, legs.
parts.push(pathEl("M300 250 C333 209 405 215 438 258 C471 303 445 371 391 382 C337 392 282 329 300 250Z", 4.8));
parts.push(pathEl("M312 234 C348 202 404 207 434 245", 4.2));
parts.push(pathEl("M342 218 C366 206 397 210 420 230", 3.4));
parts.push(pathEl("M382 214 C410 212 436 226 451 250", 3.2));
parts.push(pathEl("M333 361 C315 426 288 514 274 621 C294 657 376 678 456 649 C455 540 440 450 414 374", 5));
parts.push(pathEl("M296 438 C235 487 193 553 171 634", 4.8));
parts.push(pathEl("M176 635 C204 649 238 642 264 615", 4.3));
parts.push(pathEl("M420 425 C470 504 505 601 524 717", 4.8));
parts.push(pathEl("M484 671 C535 683 564 719 568 761", 4.2));
parts.push(pathEl("M401 623 C434 644 478 649 523 629", 3.8));
parts.push(pathEl("M306 659 C293 788 303 935 319 1113", 4.8));
parts.push(pathEl("M443 652 C479 815 523 982 565 1158", 4.8));
parts.push(pathEl("M316 1111 C359 1143 414 1140 453 1107", 4.8));
parts.push(pathEl("M548 1157 C598 1192 678 1189 717 1148", 4.8));
parts.push(pathEl("M306 652 C339 678 401 682 457 650", 3.8));
parts.push(pathEl("M205 555 C252 536 306 547 337 584 C292 616 242 616 205 555Z", 3.8));
parts.push(pathEl("M333 571 C356 556 390 562 409 588 C382 604 351 600 333 571Z", 3.2));
parts.push(pathEl("M371 561 C395 545 435 553 454 582 C420 599 389 595 371 561Z", 3.2));
parts.push(pathEl("M298 380 C335 405 383 411 430 382", 3.2));

// Center-left woman: curly hair, white T-shirt, strap, hand at flag pole.
parts.push(pathEl("M662 211 C706 156 800 172 842 242 C876 301 851 393 779 419 C702 448 635 369 641 288 C642 260 647 235 662 211Z", 4.8));
parts.push(pathEl("M641 282 C606 335 593 421 626 507", 4.5));
parts.push(pathEl("M841 257 C903 342 894 441 833 523", 4.5));
parts.push(pathEl("M628 410 C609 509 602 604 620 707", 4.8));
parts.push(pathEl("M826 419 C858 525 853 627 817 719", 4.8));
parts.push(pathEl("M626 423 C684 471 760 479 824 427", 3.8));
parts.push(pathEl("M663 421 C684 561 694 699 691 849", 4.2));
parts.push(pathEl("M604 505 C560 576 548 638 560 713", 4.6));
parts.push(pathEl("M819 513 C877 584 926 655 977 750", 4.6));
parts.push(pathEl("M616 706 C657 740 760 745 817 718", 4.5));
parts.push(pathEl("M638 728 C615 860 604 978 604 1115", 4.5));
parts.push(pathEl("M792 728 C823 884 846 1015 861 1135", 4.5));
parts.push(pathEl("M594 1112 C632 1142 691 1138 728 1103", 4.5));
parts.push(pathEl("M849 1135 C894 1162 960 1154 997 1115", 4.5));
parts.push(pathEl("M663 437 C699 463 760 464 824 428", 3.2));
parts.push(pathEl("M558 693 C581 664 619 662 642 692 C613 720 581 720 558 693Z", 3.8));
parts.push(pathEl("M742 475 C783 522 818 583 846 661", 3.6));
parts.push(pathEl("M653 212 C689 173 797 172 838 242", 3.2));

// Center man: dark shirt, raised cup, crossed arm.
parts.push(pathEl("M1005 124 C1047 82 1130 91 1170 144 C1212 200 1188 286 1119 310 C1058 330 998 276 989 206 C986 175 990 146 1005 124Z", 4.8));
parts.push(pathEl("M1003 121 C1040 77 1139 78 1176 137", 4.2));
parts.push(pathEl("M1024 303 C989 420 978 575 1010 725 C1059 767 1166 760 1225 717 C1230 573 1215 421 1157 306", 5));
parts.push(pathEl("M1009 374 C949 461 901 560 865 682", 4.8));
parts.push(pathEl("M1167 383 C1246 467 1309 568 1362 690", 4.8));
parts.push(pathEl("M1098 522 C1156 535 1222 582 1264 650 C1210 666 1148 642 1087 584", 4.8));
parts.push(pathEl("M1260 642 C1306 616 1360 629 1386 676 C1331 695 1283 683 1260 642Z", 4));
parts.push(pathEl("M1267 520 C1306 494 1370 510 1392 552 C1344 575 1290 564 1267 520Z", 3.8));
parts.push(pathEl("M1011 724 C1065 760 1164 759 1224 717", 4.2));
parts.push(pathEl("M1049 745 C1029 879 1026 1016 1041 1163", 4.5));
parts.push(pathEl("M1190 743 C1237 873 1283 1020 1327 1165", 4.5));
parts.push(pathEl("M1030 1160 C1078 1198 1151 1195 1190 1154", 4.5));
parts.push(pathEl("M1308 1161 C1365 1194 1436 1186 1470 1145", 4.5));
parts.push(pathEl("M1018 304 C1062 334 1123 334 1162 305", 3.2));

// Right-center woman: long hair, white shirt, strap, cup, bent toward flag.
parts.push(pathEl("M1326 274 C1365 221 1452 242 1479 305 C1507 374 1458 456 1383 443 C1322 432 1292 332 1326 274Z", 4.8));
parts.push(pathEl("M1291 304 C1234 410 1248 528 1311 633", 4.8));
parts.push(pathEl("M1477 309 C1544 420 1540 539 1490 662", 4.8));
parts.push(pathEl("M1309 429 C1282 533 1280 642 1310 752", 4.8));
parts.push(pathEl("M1489 430 C1514 545 1508 657 1468 760", 4.8));
parts.push(pathEl("M1310 447 C1378 495 1434 494 1488 431", 3.8));
parts.push(pathEl("M1326 491 C1383 630 1404 762 1394 886", 4.3));
parts.push(pathEl("M1302 598 C1242 684 1210 770 1217 858", 4.7));
parts.push(pathEl("M1476 602 C1542 683 1586 779 1611 890", 4.7));
parts.push(pathEl("M1310 752 C1361 801 1433 803 1468 760", 4.2));
parts.push(pathEl("M1340 785 C1316 908 1300 1033 1296 1170", 4.5));
parts.push(pathEl("M1460 785 C1500 916 1525 1042 1537 1180", 4.5));
parts.push(pathEl("M1280 1168 C1327 1196 1389 1191 1426 1155", 4.5));
parts.push(pathEl("M1519 1175 C1565 1200 1624 1190 1656 1150", 4.5));
parts.push(pathEl("M1276 546 C1317 527 1368 549 1391 599 C1342 624 1298 603 1276 546Z", 3.8));
parts.push(pathEl("M1366 513 C1388 652 1418 772 1460 894", 3.8));
parts.push(pathEl("M1328 269 C1374 238 1447 248 1478 304", 3.2));

// Far-right woman: hair, sleeveless top, skirt, cup/book.
parts.push(pathEl("M1584 260 C1627 212 1712 223 1751 278 C1788 331 1762 414 1698 431 C1630 449 1561 377 1568 308 C1570 288 1574 272 1584 260Z", 4.8));
parts.push(pathEl("M1565 296 C1518 382 1530 495 1577 618", 4.8));
parts.push(pathEl("M1751 290 C1828 400 1816 515 1772 650", 4.8));
parts.push(pathEl("M1585 424 C1561 543 1561 653 1592 758", 4.8));
parts.push(pathEl("M1766 424 C1807 547 1800 658 1768 759", 4.8));
parts.push(pathEl("M1591 753 C1640 812 1733 813 1772 758", 4.3));
parts.push(pathEl("M1550 795 C1632 846 1742 850 1811 795", 4.8));
parts.push(pathEl("M1617 836 C1595 960 1580 1065 1577 1178", 4.5));
parts.push(pathEl("M1740 836 C1778 962 1810 1070 1832 1178", 4.5));
parts.push(pathEl("M1558 1175 C1605 1208 1670 1202 1712 1162", 4.5));
parts.push(pathEl("M1815 1176 C1868 1207 1930 1196 1960 1153", 4.5));
parts.push(pathEl("M1579 591 C1512 691 1468 790 1456 906", 4.7));
parts.push(pathEl("M1764 590 C1829 681 1870 781 1885 904", 4.7));
parts.push(pathEl("M1695 598 C1735 585 1780 612 1787 658 C1737 680 1702 652 1695 598Z", 3.8));
parts.push(pathEl("M1778 615 C1828 600 1872 622 1898 674", 3.8));
parts.push(pathEl("M1579 424 C1639 468 1716 468 1758 424", 3.2));
parts.push(pathEl("M1584 255 C1640 223 1719 229 1750 279", 3.2));

// Hand/flag contact details and key folds.
parts.push(pathEl("M556 694 C585 672 626 675 652 705", 3.8));
parts.push(pathEl("M918 686 C956 659 1010 663 1045 702", 3.8));
parts.push(pathEl("M1268 846 C1312 816 1364 827 1399 866", 3.8));
parts.push(pathEl("M1456 904 C1500 866 1550 879 1574 924", 3.8));
parts.push(pathEl("M709 938 C790 975 850 1032 910 1110", 3.2));
parts.push(pathEl("M687 1160 C772 1198 857 1228 949 1462", 3.2));
parts.push(pathEl("M993 1195 C1110 1138 1217 1128 1402 1264", 3.2));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200" role="img" aria-labelledby="title desc">
  <title id="title">Photo contour trace of people holding a flag</title>
  <desc id="desc">Hand-traced contour line artwork based on the foreground people and flag in DSC_7740.jpg.</desc>
  <g transform="translate(0 80) scale(0.6667)" fill="none" stroke="${stroke}" stroke-linecap="round" stroke-linejoin="round">
    ${parts.join("\n    ")}
  </g>
</svg>
`;

for (const filename of ["people_flag_photo_trace.svg", "people_flag_line_art.svg", "t-01.svg"]) {
  fs.writeFileSync(path.join(imageDir, filename), svg);
}

console.log(path.join(imageDir, "people_flag_photo_trace.svg"));
